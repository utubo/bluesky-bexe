import { settingsStore } from '$lib/settingsStore.svelte';
import {
  type Feed,
  type FeedItem,
  toFeed,
  getTimeline,
  getMentions,
  getAuthorFeed,
  getActorLikes,
  getBookmarks,
  getNotifications,
  searchPosts,
  feedPosts,
  listPosts,
  getQuotes,
  getPostThread,
  deletePost
} from '$lib/bsky';
import { safely } from '$lib/errorStore.svelte';
import type { PostRef, PostThread, MyFeed } from '$lib/bsky';

export type TabType =
  'timeline' |
  'mentions' |
  'likes' |
  'bookmarks' |
  'notifications' |
  'user_posts' |
  'thread' |
  'quotes' |
  'search' |
  'feed' |
  'settings';

export interface Author {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface FeedState {
  posts: FeedItem[];
  cursor: string | undefined;
  lastFetched: number;
  polling?: boolean;
  refreshOnSwitch?: boolean;
}

interface QueueItem {
  item: FeedItem;
  setter: (posts: FeedItem[]) => void;
  tabKey: TabType;
  immediate: boolean;
}

interface Target {
  tab: TabType;
  key: string;
  feed?: MyFeed;
  author?: Author;
  feedItem?: FeedItem;
}

export const NO_TARGET: Target = {
  tab: 'timeline', key: ''
}

interface FeedHistoryEntry {
  activeTab: TabType;
  target: Target;
  feed: FeedState;
}

/** Queue recheck interval in milliseconds (5 seconds) */
const QUEUE_RECHECK_MSEC = 5000;
/** Maximum number of posts to cache per tab */
const MAX_POSTS = 1000;
/** Maximum number of posts to check for metric updates (likes, reposts, etc.) */
const POLL_UPDATE_LIMIT = 50;
/** Maximum author feed items to fetch */
const AUTHOR_FEED_LIMIT = 50;
/** Thread fetch depth */
const THREAD_DEPTH = 8;
/** Thread parent height */
const THREAD_PARENT_HEIGHT = 8;

const FETCH_MY_POST_RETRIES = 3;
const FETCH_MY_POST_DELAY = 300;

class FeedStore {
  myDid = '';
  activeTab = $state<TabType>('timeline');
  isFeedLoading = $state(false);
  isLoadingMore = $state(false);
  target = $state(NO_TARGET);

  feeds = $state<Record<TabType, FeedState>>({
    timeline: { posts: [], cursor: undefined, lastFetched: 0 },
    mentions: { posts: [], cursor: undefined, lastFetched: 0, refreshOnSwitch: true },
    likes: { posts: [], cursor: undefined, lastFetched: 0, refreshOnSwitch: true },
    bookmarks: { posts: [], cursor: undefined, lastFetched: 0, refreshOnSwitch: true },
    notifications: { posts: [], cursor: undefined, lastFetched: 0, refreshOnSwitch: true },
    user_posts: { posts: [], cursor: undefined, lastFetched: 0, polling: true },
    thread: { posts: [], cursor: undefined, lastFetched: 0, polling: true },
    quotes: { posts: [], cursor: undefined, lastFetched: 0, polling: true },
    search: { posts: [], cursor: undefined, lastFetched: 0, polling: true },
    feed: { posts: [], cursor: undefined, lastFetched: 0, polling: true },
    settings: { posts: [], cursor: undefined, lastFetched: 0 }
  });

  // Queue and polling state
  private pollTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  private insertQueue: QueueItem[] = [];
  private isProcessingQueue = false;

  // Callbacks
  private onNewMention = () => {};

  private latestMentionUri: string | null = null;

  private get pollIntervalMsec() {
    return settingsStore.updateDelayInterval ?? 45000;
  }

  /** Returns the post list for the currently active tab */
  get currentPosts() {
    return !this.isFeedLoading && this.feeds[this.activeTab]?.posts || [];
  }

  snapshotHistoryEntry(): FeedHistoryEntry {
    return {
      activeTab: this.activeTab,
      feed: Object.assign({}, this.feeds[this.activeTab]),
      target: Object.assign({}, this.target),
    };
  }

  applyHistoryEntry(history: FeedHistoryEntry) {
    this.activeTab = history.activeTab;
    Object.assign(this.feeds[history.activeTab], history.feed);
    Object.assign(this.target, history.target);
  }

  // ==========================================
  // Initialization & Tab Control
  // ==========================================

  init(did: string, _onNewMention: () => void) {
    this.myDid = did;
    this.onNewMention = _onNewMention;
  }

  /** Loads initial data upon application startup */
  async loadInitialData() {
    this.isFeedLoading = true;
    this.resetCurrentPosts('timeline');
    const res = await safely(getTimeline);
    this.feeds.timeline.cursor = res?.cursor;
    this.feeds.timeline.posts = this.filterUnique(res?.feed || [], []);
    this.isFeedLoading = false;
    this.loadBackgroundInitialData();
  }

  async loadMore() {
    const tabState = this.feeds[this.activeTab];
    if (this.isFeedLoading || this.isLoadingMore || !tabState) return;
    this.isLoadingMore = true;
    await safely(async () => {
      const res = await safely(() => this.fetchActiveTab(tabState.cursor));
      if (res?.feed) {
        tabState.cursor = res.cursor;
        const uniqueItems = this.filterUnique(res.feed, tabState.posts);
        tabState.posts = [...tabState.posts, ...uniqueItems];
      }
    });
    this.isLoadingMore = false;
  }

  resetCurrentPosts(tab: TabType) {
    Object.assign(this.feeds[tab], { posts: [], cursor: undefined, lastFetched: 0 });
  }

  // ==========================================
  // Background & Tab Switching
  // ==========================================

  private async loadBackgroundInitialData() {
    const [mentionsRes, likesRes, bookmarksRes, notificationsRes] = await Promise.all([
      safely(async () => getMentions()),
      safely(() => getActorLikes(this.myDid)),
      safely(() => getBookmarks()),
      safely(() => getNotifications()),
    ]);
    if (mentionsRes) {
      this.latestMentionUri = this.getLatestMentionUri(mentionsRes.feed);
      this.feeds.mentions.posts = this.processMentions(mentionsRes.feed);
      this.feeds.mentions.cursor = mentionsRes.cursor;
    }
    this.feeds.likes.posts = this.filterUnique(likesRes?.feed || [], []);
    this.feeds.likes.cursor = likesRes?.cursor;
    this.feeds.bookmarks.posts = this.filterUnique(bookmarksRes?.feed || [], []);
    this.feeds.bookmarks.cursor = bookmarksRes?.cursor;
    this.feeds.notifications.posts = this.filterUniqueCid(notificationsRes?.feed || [], []);
    this.feeds.notifications.cursor = notificationsRes?.cursor;
  }

  async switchTab(tab: TabType) {
    this.activeTab = tab;
    const tabState = this.feeds[tab];

    if (tab === 'timeline' && tabState.posts.length === 0) {
      const res = await safely(getTimeline);
      tabState.posts = this.filterUnique(res?.feed || [], []);
    } else if (tabState.refreshOnSwitch) {
      const now = Date.now();
      const isStale = (now - tabState.lastFetched) > settingsStore.updateDelayInterval;
      if (tabState.posts.length === 0 || isStale) {
        const res = await safely(() => this.fetchActiveTab());
        const feed = res?.feed || [];
        this.updateMetrics(tabState.posts, feed);
        const newItems = this.filterUnique(feed, tabState.posts);
        tabState.posts = [...newItems, ...tabState.posts];
        tabState.lastFetched = Date.now();
      }
    }
  }

  // ==========================================
  // Polling & Background Updates
  // ==========================================

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollTimeline();
      this.pollMentions();
      if (this.feeds[this.activeTab].polling) {
        this.pollGenericTab(this.activeTab, () => this.fetchActiveTab());
      }
    }, this.pollIntervalMsec);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async pollGenericTab(tabKey: TabType, fetchFn: () => Promise<Feed>) {
    try {
      const res = await safely(fetchFn);
      const latestPosts = res?.feed || [];
      if (latestPosts.length === 0) return;

      const tabState = this.feeds[tabKey];
      this.updateMetrics(tabState.posts, latestPosts);
      this.handleNewItems(latestPosts, tabState.posts, (p) => { tabState.posts = p; }, tabKey);
    } catch (err) {
      console.error(`${tabKey} polling error:`, err);
    }
  }

  private async pollTimeline() {
    await this.pollGenericTab('timeline', () => getTimeline());
  }

  private async pollMentions() {
    try {
      const res = await getMentions();
      if (res.feed.length === 0) return;
      const processed = this.processMentions(res.feed);
      const newLatestUri = this.getLatestMentionUri(res.feed);
      let hasNew = false;
      if (newLatestUri) {
        hasNew = this.latestMentionUri !== newLatestUri;
        this.latestMentionUri = newLatestUri;
      }
      this.updateMetrics(this.feeds.mentions.posts, processed);
      const uniqueItems = this.filterUnique(processed, this.feeds.mentions.posts);
      if (uniqueItems.length > 0) {
        this.feeds.mentions.posts = [...uniqueItems, ...this.feeds.mentions.posts];
      }
      this.feeds.mentions.lastFetched = Date.now();

      if (hasNew && this.activeTab !== 'mentions') {
        this.onNewMention();
      }
    } catch (err) {
      console.error("Notifications polling error:", err);
    }
  }

  private getLatestMentionUri(feed: FeedItem[]): string | null {
      const withoutOwnPosts = feed.filter(item => {
        const authorDid = item.post?.author?.did;
        return authorDid !== this.myDid;
      });
      if (withoutOwnPosts.length === 0) {
        return null;
      }
      const getTimestamp = (item: FeedItem) => {
        return item?.post.record?.createdAt || item?.post.indexedAt || '';
      };
      const sortedOtherPosts = [...withoutOwnPosts].sort((a, b) => {
        return getTimestamp(b).localeCompare(getTimestamp(a));
      });
      const latest = sortedOtherPosts[0];
      const latestUri = latest?.post?.uri || latest?.uri;
      return latestUri;
  }

  /** Unified cache invalidation helper */
  invalidateCache(tab: TabType) {
    if (this.feeds[tab]) {
      this.feeds[tab].lastFetched = 0;
    }
  }

  // ==========================================
  // Queue & Insert Management
  // ==========================================

  async fetchAndAddMyLatestPost(myDid: string, myPost: PostRef): Promise<boolean> {
    for (let attempt = 1; attempt <= FETCH_MY_POST_RETRIES; attempt++) {
      try {
        const res = await getAuthorFeed(myDid, undefined, 5);
        const matchedPost = res.feed.find((item: FeedItem) => {
          const uri = item?.post?.uri;
          return uri === myPost.uri;
        });
        if (matchedPost) {
          this.addPostImmediately(matchedPost);
          return true;
        }
      } catch (e) {
        console.warn(`Attempt ${attempt} failed to fetch posted item, retrying...`, e);
      }
      await new Promise((resolve) => setTimeout(resolve, FETCH_MY_POST_DELAY));
    }
    return false;
  }

  addPostImmediately(newItem: FeedItem) {
    if (!newItem) return;
    const newUri = newItem?.post?.uri || newItem?.uri;
    if (!newUri) return;

    const currentTab = this.activeTab;
    if (currentTab === 'mentions') {
      this.invalidateCache('mentions');
      return;
    }

    const tabState = this.feeds[currentTab];
    if (!tabState) return;

    this.insertQueue.push({
      item: newItem,
      setter: (p: FeedItem[]) => { tabState.posts = p; },
      tabKey: currentTab,
      immediate: true
    });
    this.processQueue();
  }

  private handleNewItems(
    latestPosts: FeedItem[],
    existingPosts: FeedItem[],
    setter: (newPosts: FeedItem[]) => void,
    tabKey: TabType
  ) {
    if (!Array.isArray(latestPosts) || latestPosts.length === 0) return;

    if (existingPosts.length === 0) {
      setter(this.filterUnique(latestPosts, []));
      return;
    }

    const topUri = existingPosts[0]?.post?.uri || existingPosts[0]?.uri;
    const topIndex = latestPosts.findIndex((item: FeedItem) => item?.post?.uri === topUri);

    let newItems: FeedItem[] = [];
    if (topIndex > 0) {
      newItems = latestPosts.slice(0, topIndex);
    } else if (topIndex === -1 && latestPosts.length > 0) {
      newItems = latestPosts.slice(0, 5);
    }

    const uniqueNewItems = this.filterUnique(newItems, existingPosts);
    if (uniqueNewItems.length > 0) {
      for (const item of uniqueNewItems) {
        this.insertQueue.push({ item, setter, tabKey, immediate: false });
      }
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.insertQueue.length === 0) return;
    this.isProcessingQueue = true;

    const delay = Date.now() - this.pollIntervalMsec;
    const remaindQueue: QueueItem[] = [];
    const groupMap = new Map<TabType, { items: FeedItem[], setter: Function }>();

    try {
      for (const queueItem of this.insertQueue) {
        const { item, setter, tabKey, immediate } = queueItem;

        if (!immediate) {
          const itemTimeStr = item?.post?.indexedAt;
          const timestamp = itemTimeStr ? new Date(itemTimeStr).getTime() : 0;
          if (timestamp && delay < timestamp) {
            remaindQueue.push(queueItem);
            continue;
          }
        }

        if (!groupMap.has(tabKey)) {
          groupMap.set(tabKey, { items: [], setter });
        }
        groupMap.get(tabKey)!.items.push(item);
      }

      for (const [tabKey, data] of groupMap.entries()) {
        const tabState = this.feeds[tabKey];
        const currentArray = tabState ? tabState.posts : [];
        const combined = this.filterUnique([...data.items, ...currentArray], []).slice(0, MAX_POSTS);
        data.setter(combined);
      }

      this.insertQueue = remaindQueue;
    } finally {
      this.isProcessingQueue = false;
      if (this.insertQueue.length > 0) {
        setTimeout(() => this.processQueue(), QUEUE_RECHECK_MSEC);
      }
    }
  }

  // ==========================================
  // Navigation & Actions
  // ==========================================

  async openTarget(item: Target) {
    if (!item) return;
    if (this.target?.tab !== item.tab || this.target?.key !== item.key) {
      this.isFeedLoading = true;
      this.resetCurrentPosts(item.tab);
      Object.assign(this.target, item);
    }
    this.activeTab = item.tab;
    const tabState = this.feeds[item.tab];
    const res = await safely(() => this.fetchActiveTab());
    tabState.posts = res?.feed || [];
    tabState.cursor = res?.cursor;
    this.isFeedLoading = false;
  }

  async openThread(item: FeedItem) {
    this.openTarget({ tab: 'thread', key: item?.post?.uri });
  }

  async viewQuotes(item: FeedItem) {
    this.openTarget({ tab: 'quotes', key: item?.post?.uri });
  }

  async selectUser(author: Author) {
    this.openTarget({ tab: 'user_posts', key: author.handle, author });
  }

  async search(query: string) {
    if (!query.trim()) return;
    this.openTarget({ tab: 'search', key: query });
  }

  async feed(feed: MyFeed) {
    if (!feed) return;
    this.openTarget({ tab: 'feed', key: feed.uri, feed });
  }

  async fetchActiveTab(cursor?: string): Promise<Feed> {
    switch (this.activeTab) {
      case 'timeline': return getTimeline(cursor);
      case 'likes': return getActorLikes(this.myDid, cursor);
      case 'bookmarks': return getBookmarks(cursor);
      case 'notifications': return getNotifications(cursor);
      case 'search': return searchPosts(this.target.key, cursor);
      case 'quotes': return getQuotes(this.target.key);
      case 'thread': return this.fetchFlattenThread();
      case 'mentions':
        const res = await getMentions();
        res.feed = this.processMentions(res.feed);
        return res;
      case 'user_posts':
        if (this.target.author?.handle) {
          return getAuthorFeed(this.target.author.handle, cursor);
        } else {
          break;
        }
      case 'feed':
        if (this.target.feed?.type === 'feed') {
          return feedPosts(this.target.key, cursor);
        } else if (this.target.feed?.type === 'list') {
          return listPosts(this.target.key, cursor);
        } else {
          break;
        }
    }
    return { feed:[], cursor: undefined };
  }

  private async fetchFlattenThread(): Promise<Feed> {
    const thread = await getPostThread(
      this.target!.key,
      THREAD_DEPTH,
      THREAD_PARENT_HEIGHT
    );
    return toFeed(this.flattenThread(thread), '');
  }


  async deletePost(uri: string) {
    await safely(async () => {
      await deletePost(uri);
      for (const key of Object.keys(this.feeds) as TabType[]) {
        this.feeds[key].posts = this.feeds[key].posts.filter(p => p.uri !== uri);
      }
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  private updateMetrics(list: FeedItem[], latestPosts: FeedItem[]) {
    if (!Array.isArray(list) || !Array.isArray(latestPosts)) return;
    const checkLimit = Math.min(list.length, POLL_UPDATE_LIMIT);
    for (let i = 0; i < checkLimit; i++) {
      const item = list[i];
      const existingUri = item?.post?.uri;
      if (!existingUri) continue;

      const latestMatch = latestPosts.find((p: FeedItem) => (p?.post?.uri || p?.uri) === existingUri);
      const targetPost = latestMatch?.post;
      const currentPost = item?.post;

      if (targetPost && currentPost) {
        currentPost.likeCount = targetPost.likeCount;
        currentPost.repostCount = targetPost.repostCount;
        currentPost.replyCount = targetPost.replyCount;
        if (targetPost.viewer) {
          currentPost.viewer = targetPost.viewer;
        }
      }
    }
  }

  private filterUnique(newItems: FeedItem[], existingPosts: FeedItem[]): FeedItem[] {
    const seenUris = new Set(existingPosts.map(p => p?.post?.uri || p?.uri).filter(Boolean));
    const filtered: FeedItem[] = [];
    for (const item of newItems) {
      const uri = item?.post?.uri;
      if (uri && !seenUris.has(uri)) {
        seenUris.add(uri);
        filtered.push(item);
      }
    }
    return filtered;
  }

  private filterUniqueCid(newItems: FeedItem[], existingPosts: FeedItem[]): FeedItem[] {
    const seenCids = new Set(existingPosts.map(p => p?.cid).filter(Boolean));
    const filtered: FeedItem[] = [];
    for (const item of newItems) {
      const cid = item.cid;
      if (cid && !seenCids.has(cid)) {
        seenCids.add(cid);
        filtered.push(item);
      }
    }
    return filtered;
  }

  private processMentions(rawMentions: FeedItem[]): FeedItem[] {
    if (!settingsStore.enableProcessMentions) {
      return rawMentions;
    }

    // 1. Build a map of all posts by URI for easy parent-child linking
    const postByUri = new Map<string, FeedItem>();

    // First pass: register all posts and their basic structures
    for (const item of rawMentions) {
      if (item.post?.uri) {
        postByUri.set(item.post.uri, {
          post: item.post,
          actor: item.actor,
          reply: item.reply,
          reason: item.reason,
          indexedAt: item.indexedAt,
          replies: [] as FeedItem[],
        });
      }
    }

    // Root thread map to hold top-level conversation nodes
    const threadRoots = new Map<string, FeedItem>();

    // Second pass: establish parent-child relationships
    for (const item of rawMentions) {
      if (!item.post?.uri) continue;

      const node = postByUri.get(item.post.uri);
      const parentUri = item.reply?.parent?.uri || item.post?.record?.reply?.parent?.uri;

      if (parentUri && postByUri.has(parentUri)) {
        // If parent exists in our fetched set, attach as child (reply) to the parent node
        const parentNode = postByUri.get(parentUri);
        // Avoid duplicate pushes
        if (!parentNode?.replies.some((r: FeedItem) => r.post?.uri === node?.post?.uri)) {
          parentNode?.replies?.push(node);
        }
      } else {
        // If no parent in set (or it's the top of the fetched branch), treat as a thread root
        const rootKey = item.post.record?.reply?.root?.uri || parentUri || item.post.uri;
        if (!threadRoots.has(rootKey)) {
          // If there is an external parent (e.g. item.reply), wrap it nicely
          if (item.reply?.parent) {
            threadRoots.set(rootKey, {
              post: item.reply.parent,
              actor: item.actor,
              replies: [node],
              reason: item.reason,
              indexedAt: item.indexedAt,
            });
          } else if (node) {
            threadRoots.set(rootKey, node);
          }
        } else {
          // Add to existing root's replies if not already present
          const rootNode = threadRoots.get(rootKey);
          if (rootNode) {
            if (!rootNode.replies.some((r: FeedItem) => r.post?.uri === node?.post?.uri)) {
              rootNode.replies.push(node);
            }
          }
        }
      }
    }

    const rootsArray = Array.from(threadRoots.values());

    // 3. Sort thread roots by latest timestamp in the tree
    const sortedRoots = [...rootsArray].sort((a, b) => {
      const timeA = this.getLatestTimestampInTree(a);
      const timeB = this.getLatestTimestampInTree(b);
      return timeB - timeA;
    });

    // 4. Flatten each thread tree using flattenThread
    const flattenedItems: FeedItem[] = [];
    for (const threadRoot of sortedRoots) {
      const flattened = this.flattenThread(threadRoot, 0);
      if (flattened.length > 0) {
        flattened[flattened.length - 1].isLatestInThread = true;
      }
      flattenedItems.push(...flattened);
    }

    return flattenedItems;
  }

  private getLatestTimestampInTree(node: FeedItem): number {
    if (!node) return 0;
    let latest = node.indexedAt ? new Date(node.indexedAt).getTime() : 0;
    if (node.post?.indexedAt) {
      const postTime = new Date(node.post.indexedAt).getTime();
      if (postTime > latest) latest = postTime;
    }
    if (Array.isArray(node.replies)) {
      for (const reply of node.replies) {
        const replyTime = this.getLatestTimestampInTree(reply);
        if (replyTime > latest) latest = replyTime;
      }
    }
    return latest;
  }

  private flattenThread(thread: PostThread, depth: number = 0): FeedItem[] {
    const nodes: FeedItem[] = [];
    if (!thread) return nodes;

    if (thread.parent) {
      nodes.push(...this.flattenThread(thread.parent, depth - 1));
    }

    if (thread.post) {
      nodes.push({
        post: thread.post,
        actor: thread.actor,
        reply: thread.reply,
        reason: thread.reason,
        depth: depth,
        continued: false,
        continuedUp: false,
      });
    }

    if (Array.isArray(thread.replies)) {
      for (const reply of thread.replies) {
        if (reply && reply.post) {
          nodes.push(...this.flattenThread(reply, depth + 1));
        }
      }
    }

    if (depth === 0) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const current = nodes[i];
        const next = nodes[i + 1];

        if (next.depth > current.depth) {
          current.continued = true;
          next.continuedUp = true;
        }
      }
    }

    return nodes;
  }
}

export const feedStore = new FeedStore();
