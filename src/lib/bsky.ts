import { AtpAgent, RichText } from "@atproto/api";
import { AppBskyActorDefs } from '@atproto/api';
import { settingsStore } from '$lib/settingsStore.svelte';

const STORAGE_KEY = "bsky_session_data";

const MENTIONS_MAX_PAGES = 5;

// ==========================================
// Interface / Type
// ==========================================

export type { AppBskyActorDefs, } from "@atproto/api";

type PostThreadResponse = Awaited<ReturnType<typeof AtpAgent.prototype.getPostThread>>;
export type PostThread = PostThreadResponse['data']['thread'];

export interface PostRef {
  uri: string;
  cid: string;
}

export interface ReplyInfo {
  parent: PostRef;
  root: PostRef;
}

export interface MyFeed {
  type: 'feed' | 'list';
  displayName: string;
  uri: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface Feed {
  feed: FeedItem[];
  cursor: string | undefined;
}

export interface FeedItem {
  post?: any;
  actor: any;
  [key: string]: any;
}

/** Single instance of AtpAgent shared across the application */
export const agent = new AtpAgent({
  service: "https://bsky.social",
});

// ==========================================
// Session / Auth
// ==========================================

/** Restores session using provided target session data. */
export async function restoreSession(targetSession?: any): Promise<boolean> {
  try {
    let sessionData = targetSession;
    if (!sessionData) {
      const savedSession = localStorage.getItem(STORAGE_KEY);
      if (!savedSession) return false;
      sessionData = JSON.parse(savedSession);
    }

    await agent.resumeSession(sessionData);
    // Keep global key in sync with current active session
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agent.session));
    return true;
  } catch (error) {
    console.error("Failed to restore session:", error);
    return false;
  }
}

/** Executes login and returns the session data upon success. */
export async function login(identifier: string, password: string): Promise<void> {
  const cleanIdentifier = identifier.trim().replace(/^@/, "");
  const res = await agent.login({ identifier: cleanIdentifier, password });

  if (res.success && res.data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
  } else {
    throw new Error("Login was not successful");
  }
}

/** Executes logout and clears saved session information */
export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ==========================================
// Feeds & Timeline
// ==========================================

export function getDisplayName(author: any): string {
  return author?.displayName || author?.handle || 'Unknown';
}

export function normalizeFeedItem(item: any): FeedItem {
  return {
    ...item,
    post: item.post || item,
    actor:
      item.reason?.by ||
      item.reason?.author ||
      item.author ||
      item.post?.author,
  }
}

function normalizeFeed(rawList: any): FeedItem[] {
  return Array.isArray(rawList)
    ? rawList.map(normalizeFeedItem)
    : [];
}

export function toFeed(rawList: any, cursor = ''): Feed {
  return {
    feed: normalizeFeed(rawList),
    cursor,
  };
}

export async function getTimeline(cursor?: string): Promise<Feed> {
  const res = await agent.getTimeline({ cursor });
  return toFeed(res.data.feed, res.data.cursor);
}

export async function getAuthorFeed(actor: string, cursor?: string, limit?: number): Promise<Feed> {
  const res = await agent.getAuthorFeed({ actor, cursor, limit });
  return toFeed(res.data.feed, res.data.cursor);
}

export async function getPostThread(uri: string, depth: number, parentHeight: number): Promise<PostThread> {
  const res = await agent.getPostThread({ uri, depth, parentHeight });
  return res?.data?.thread
}

export async function searchPosts(q: string, cursor?: string): Promise<Feed> {
  const res = await agent.app.bsky.feed.searchPosts({q , cursor });
  return toFeed(res.data.posts, res.data.cursor);
}

export async function feedPosts(feed: string, cursor?: string): Promise<Feed> {
  const res = await agent.app.bsky.feed.getFeed({ feed, cursor });
  return toFeed(res.data.feed, res.data.cursor);
}

export async function listPosts(list: string, cursor?: string): Promise<Feed> {
  const res = await agent.app.bsky.feed.getListFeed({ list, cursor });
  return toFeed(res.data.feed, res.data.cursor);
}

export async function getProfile(did: string): Promise<AppBskyActorDefs.ProfileViewDetailed | null> {
  const res = await agent.getProfile({ actor: did });
  return res.success ? res.data : null;
}

// ==========================================
// Post Actions (Like, Repost, Follow)
// ==========================================

// Common RichText builder
async function createRichText(text: string) {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  return {
    text: rt.text,
    facets: rt.facets,
  };
}

function nsfwLabel(nsfw?: boolean) {
  if (!nsfw) return undefined;
  return {
    $type: 'com.atproto.label.defs#selfLabels',
    values: [{ val: 'sexual' }]
  }
}

/** Sends a new post (supports URLs and mentions) */
export async function postText(text: string, nsfw?: boolean): Promise<PostRef> {
  const { text: processedText, facets } = await createRichText(text);
  return await agent.post({
    text: processedText,
    facets,
    createdAt: new Date().toISOString(),
    labels: nsfwLabel(nsfw),
  });
}

/** Sends a reply post */
export async function postReply(
  text: string,
  parentPost: { uri: string; cid: string },
  rootPost: { uri: string; cid: string },
  nsfw?: boolean
): Promise<PostRef> {
  const { text: processedText, facets } = await createRichText(text);
  return await agent.post({
    text: processedText,
    facets,
    createdAt: new Date().toISOString(),
    labels: nsfwLabel(nsfw),
    reply: {
      root: { uri: rootPost.uri, cid: rootPost.cid },
      parent: { uri: parentPost.uri, cid: parentPost.cid },
    },
  });
}

/** Sends a quote repost */
export async function postQuote(
  text: string,
  targetPost: PostRef,
  nsfw?: boolean
): Promise<PostRef> {
  const { text: processedText, facets } = await createRichText(text);
  return await agent.post({
    text: processedText,
    facets,
    createdAt: new Date().toISOString(),
    labels: nsfwLabel(nsfw),
    embed: {
      $type: 'app.bsky.embed.record',
      record: {
        uri: targetPost.uri,
        cid: targetPost.cid,
      },
    },
  });
}

/** Uploads images and sends a post */
export async function postWithImages(
  text: string,
  images: { blob: any; alt: string }[],
  replyInfo?: ReplyInfo,
  quoteTarget?: PostRef,
  nsfw?: boolean
): Promise<PostRef> {
  const uploadedImages = [];

  for (const img of images) {
    const res = await agent.uploadBlob(img.blob);
    if (res.success) {
      uploadedImages.push({
        image: res.data.blob,
        alt: img.alt || "",
      });
    }
  }

  let embed: any = {
    $type: 'app.bsky.embed.images',
    images: uploadedImages,
  };

  if (quoteTarget) {
    embed = {
      $type: 'app.bsky.embed.recordWithMedia',
      media: {
        $type: 'app.bsky.embed.images',
        images: uploadedImages,
      },
      record: {
        record: {
          uri: quoteTarget.uri,
          cid: quoteTarget.cid,
        },
      },
    };
  }

  const { text: processedText, facets } = await createRichText(text);

  const postData: any = {
    text: processedText,
    facets,
    createdAt: new Date().toISOString(),
    labels: nsfwLabel(nsfw),
    embed,
  };

  if (replyInfo) {
    postData.reply = {
      root: { uri: replyInfo.root.uri, cid: replyInfo.root.cid },
      parent: { uri: replyInfo.parent.uri, cid: replyInfo.parent.cid },
    };
  }

  return await agent.post(postData);
}

export async function repostPost(uri: string, cid: string): Promise<string | undefined> {
  const res = await agent.repost(uri, cid);
  return res.uri;
}

export async function deleteRepost(repostUri: string): Promise<void> {
  await agent.deleteRepost(repostUri);
}

export async function likePost(uri: string, cid: string): Promise<string> {
  const res = await agent.like(uri, cid);
  return res.uri;
}

export async function deleteLike(likeUri: string): Promise<void> {
  await agent.deleteLike(likeUri);
}

export async function createBookmark(uri: string, cid: string): Promise<boolean> {
  const res = await agent.app.bsky.bookmark.createBookmark({ uri, cid });
  return !!res;
}

export async function deleteBookmark(uri: string): Promise<void> {
  await agent.app.bsky.bookmark.deleteBookmark({ uri });
}

export async function deletePost(uri: string): Promise<void> {
  await agent.deletePost(uri);
}

export async function followUser(did: string): Promise<string> {
  const res = await agent.follow(did);
  return res.uri;
}

export async function unfollowUser(followUri: string): Promise<void> {
  await agent.deleteFollow(followUri);
}

// ==========================================
// Complex Fetches (Notifications, Likes)
// ==========================================

async function fetchMentions(cursor?: string): Promise<any> {
  const limit = 100;
  const reasons = ['reply', 'mention', 'quote'];
  if (!settingsStore.preventMissingMentions) {
    return await agent.listNotifications({ cursor, limit, reasons });
  }

  const res = await agent.listNotifications({ cursor: cursor, limit: 100 });
  let notifications = res?.data?.notifications?.filter(n => reasons.includes(n.reason)) || [];
  let newCursor = res?.data?.cursor;
  for (let i = 0; i < MENTIONS_MAX_PAGES; i ++) {
    if (!newCursor) break;
    if (notifications.length >= limit) break;
    const res = await agent.listNotifications({ cursor: newCursor, limit: 100 });
    const notif = (res?.data?.notifications || [])
      .filter(n => reasons.includes(n.reason));
    notifications = [...notifications, ...notif];
    newCursor = res?.data?.cursor;
  }
  return { data: { cursor: newCursor, notifications } };
}

/** Fetches notifications, filters relevant types, and enriches with parent posts and chained user replies */
export async function getMentions(cursor?: string): Promise<Feed> {
  // 1. Fetch notifications
  const res = await fetchMentions(cursor);
  const notifications = res?.data?.notifications || [];
  if (notifications.length === 0) return toFeed([], '');

  // 2. Fetch author feed to populate user's replies multi-map
  await fetchMyPosts();

  // 3. Collect unique URIs for batch fetching, traversing chained replies
  const allUrisSet = new Set<string>();
  const resolvedUserReplies: { post: any; parentUri: string }[] = [];
  const queue: string[] = [];
  const visitedUris = new Set<string>();

  // Seed the queue with notification URIs
  for (const notif of notifications) {
    if (notif.uri) {
      allUrisSet.add(notif.uri);
      queue.push(notif.uri);
    }
    const record: any = notif.record;
    if (record?.reply?.parent?.uri) {
      allUrisSet.add(record.reply.parent.uri);
    }
  }

  // Traverse multi-map to catch continuous/chained replies recursively
  while (queue.length > 0) {
    const currentUri = queue.shift()!;
    if (visitedUris.has(currentUri)) continue;
    visitedUris.add(currentUri);

    const replies = myPosts.replies.get(currentUri);
    if (replies) {
      for (const replyPost of replies) {
        if (replyPost?.uri) {
          allUrisSet.add(replyPost.uri);
          resolvedUserReplies.push({
            post: replyPost,
            parentUri: currentUri,
          });
          // Push to queue to check if there are further replies to this reply
          queue.push(replyPost.uri);
        }
      }
    }
  }

  // 4. Batch fetch all required posts in chunks of 25
  const allUris = Array.from(allUrisSet);
  const postMap = await fetchPostsBatch(allUris);

  // 5. Build items array for notifications
  const notificationItems = notifications.map((notif: any) => {
    const record: any = notif.record;
    const parentUri = record?.reply?.parent?.uri;
    const parentPost = parentUri ? postMap.get(parentUri) : undefined;
    const resolvedPost = postMap.get(notif.uri) || notif;

    return {
      post: resolvedPost,
      reason: notif.reason,
      isRead: notif.isRead,
      indexedAt: notif.indexedAt,
      reply: parentPost ? { parent: parentPost } : undefined,
    };
  });

  // 6. Build items array for user's own replies (including chained ones)
  const myReplyItems = resolvedUserReplies.map(ur => {
    const resolvedMyReply = postMap.get(ur.post.uri) || ur.post;
    const parentPost = postMap.get(ur.parentUri);

    return {
      post: resolvedMyReply,
      reason: 'user_reply',
      isRead: true,
      indexedAt: resolvedMyReply.indexedAt || new Date().toISOString(),
      reply: parentPost ? { parent: parentPost } : undefined,
    };
  });

  // 7. Combine both lists and sort by indexedAt descending (newest first)
  const combinedFeed = [...notificationItems, ...myReplyItems].sort((a, b) => {
    return new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime();
  });

  return toFeed(combinedFeed, res?.data?.cursor);
}

/** Fetches a list of posts liked by a user */
export async function getActorLikes(actor: string, cursor?: string): Promise<Feed> {
  if (!actor) return toFeed([], '');

  const res = await agent.getActorLikes({ actor, cursor });

  return toFeed(res?.data?.feed, res?.data?.cursor);
}

/** Fetches a list of users who liked a specific post */
export async function getPostLikes(uri: string, limit: number = 3) {
  const res = await agent.getLikes({ uri, limit });
  return res.data.likes;
}

/** Fetches a list of users who reposted a specific post */
export async function getPostReposts(uri: string, limit: number = 3) {
  const res = await agent.getRepostedBy({ uri, limit });
  return res.data.repostedBy;
}

export async function getBookmarks(cursor?: string): Promise<Feed> {
  const res = await agent.app.bsky.bookmark.getBookmarks({ cursor });
  return toFeed(res?.data?.bookmarks.map(p => ({
    createdAt: p.createdAt,
    post: p.item,
  })), res?.data?.cursor);
}

export async function getNotifications(cursor?: string): Promise<Feed> {
  const res = await agent.listNotifications({ cursor, reasons: ['like', 'repost', 'follow', 'like-via-repost'] });
  await fetchMyPosts();
  const getUri = (n: any) => (n.record?.subject as any)?.uri || n.reasonSubject;
  const postUris = res?.data?.notifications.map(getUri).filter(uri => !!uri);
  const postMap = await fetchPostsBatch(postUris);
  return toFeed(
    res?.data?.notifications.map(n => ({ ...n, post: postMap.get(getUri(n)), })),
    res?.data?.cursor
  );
}

export async function getQuotes(uri: string, cursor?: string): Promise<Feed> {
  const res = await agent.app.bsky.feed.getQuotes({ uri, cursor, });
  return toFeed(res?.data?.posts, res?.data?.cursor);
}

export async function getMyFeedsAndLists(): Promise<MyFeed[]> {
  const prefs = await agent.getPreferences();

  const feedUris = prefs.savedFeeds
    .filter((item) => item.type === 'feed')
    .map((item) => item.value);

  const savedListUris = prefs.savedFeeds
    .filter((item) => item.type === 'list')
    .map((item) => item.value);

  // 1. Fetch feeds, saved lists, and user-created lists in parallel
  const [feedInfoMap, savedListInfoMap, myCreatedLists] = await Promise.all([
    // Batch fetch feed generators
    (async () => {
      if (feedUris.length === 0) return new Map();
      const { data } = await agent.app.bsky.feed.getFeedGenerators({
        feeds: feedUris,
      });
      return new Map(data.feeds.map((feed) => [feed.uri, feed]));
    })(),

    // Fetch saved lists individually
    (async () => {
      const map = new Map();
      await Promise.all(
        savedListUris.map(async (uri) => {
          try {
            const { data } = await agent.app.bsky.graph.getList({
              list: uri,
              limit: 1,
            });
            map.set(uri, data.list);
          } catch {
            // Skip deleted or inaccessible lists
          }
        })
      );
      return map;
    })(),

    // Fetch all lists created by the current user
    (async () => {
      if (!agent.session?.did) return [];
      const { data } = await agent.app.bsky.graph.getLists({
        actor: agent.session.did,
        limit: 100, // Adjust as needed (max 100)
      });
      return data.lists;
    })(),
  ]);

  // 2. Build the feeds array first
  const feeds: MyFeed[] = feedUris
    .map((uri): MyFeed | null => {
      const info = feedInfoMap.get(uri);
      if (!info) return null;
      return {
        ...info,
        type: 'feed',
        displayName: info.displayName,
        uri: info.uri,
      };
    })
    .filter((item): item is MyFeed => item !== null);

  // 3. Build the saved lists array
  const lists: MyFeed[] = savedListUris
    .map((uri): MyFeed | null => {
      const info = savedListInfoMap.get(uri);
      if (!info) return null;
      return {
        ...info,
        type: 'list',
        displayName: info.name,
        uri: info.uri,
      };
    })
    .filter((item): item is MyFeed => item !== null);

  // 4. Append unpinned/unsaved user-created curate lists to the lists array
  const existingListUris = new Set(lists.map((item) => item.uri));

  for (const list of myCreatedLists) {
    // Skip if already included in saved lists
    if (existingListUris.has(list.uri)) continue;

    // Include only curate lists (exclude moderation lists)
    if (list.purpose !== 'app.bsky.graph.defs#curatelist') continue;

    lists.push({
      ...list,
      type: 'list',
      displayName: list.name,
      uri: list.uri,
    });
  }

  // 5. Return feeds followed by lists
  return [...feeds, ...lists];
}

// ==========================================
// Fetch Utilities
// ==========================================

/** Helper function to split an array into chunks of a specified size */
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const myPosts = {
  replies: new Map<string, any[]>(),
  posts: new Map<string, any>(),
  lastFetched: 0,
  actor: '',
};

/** Fetches user's author feed and maps replies into a multi-map grouped by parent URI */
async function fetchMyPosts() {
  const myDid = agent?.session?.did;
  if (!myDid) return;
  myPosts.replies = new Map<string, any[]>();
  myPosts.posts = new Map<string, any>();
  try {
    const authorFeedRes = await getAuthorFeed(myDid, undefined, 100);
    for (const item of authorFeedRes.feed) {
      myPosts.posts.set(item.uri, item.post);
      const parentUri = item.reply?.parent?.uri || item.post?.record?.reply?.parent?.uri;
      if (parentUri) {
        if (!myPosts.replies.has(parentUri)) {
          myPosts.replies.set(parentUri, []);
        }
        myPosts.replies.get(parentUri)!.push(item.post);
      }
    }
    myPosts.lastFetched = Date.now();
    myPosts.actor = myDid;
  } catch (err) {
    console.error("Failed to fetch author feed for replies multi-map:", err);
  }
}

// Maximum size of the post cache to prevent excessive memory usage
const MAX_POST_CACHE_SIZE = 1000;

// In-memory cache map for posts
const postCache = new Map<string, any>();

/**
 * Fetches post information in a batch from multiple URIs (with caching and size limit).
 */
export async function fetchPostsBatch(uris: string[]): Promise<Map<string, any>> {
  // Deduplicate and filter out empty URIs
  const allUris = Array.from(new Set(uris)).filter((uri): uri is string => Boolean(uri));
  const postMap = new Map<string, any>();

  if (allUris.length === 0) return postMap;

  const urisToFetch: string[] = [];

  // 1. Reuse items from the cache if available; otherwise, target them for API fetching
  for (const uri of allUris) {
    if (postCache.has(uri)) {
      // Re-register the accessed entry to the end (most recent) of the Map for a basic LRU mechanism
      const cachedPost = postCache.get(uri);
      postCache.delete(uri);
      postCache.set(uri, cachedPost);
      postMap.set(uri, cachedPost);
    } else if (myPosts.posts.has(uri)) {
      const cachedPost = myPosts.posts.get(uri);
      postCache.set(uri, cachedPost);
      postMap.set(uri, cachedPost);
    } else {
      urisToFetch.push(uri);
    }
  }

  // Return immediately if all items were found in the cache
  if (urisToFetch.length === 0) {
    return postMap;
  }

  try {
    // 2. Split missing URIs into chunks of 25 and fetch them in parallel
    const chunks = chunkArray(urisToFetch, 25);
    const promises = chunks.map(chunk => agent.getPosts({ uris: chunk }));
    const results = await Promise.all(promises);

    for (const postsRes of results) {
      if (postsRes.success && postsRes.data?.posts) {
        for (const p of postsRes.data.posts) {
          // Save to both the persistent cache and the result map
          postCache.set(p.uri, p);
          postMap.set(p.uri, p);
        }
      }
    }

    // 3. If the cache exceeds the maximum size limit, delete the oldest items (from the head)
    if (postCache.size > MAX_POST_CACHE_SIZE) {
      const excessCount = postCache.size - MAX_POST_CACHE_SIZE;
      const iteratorKeys = postCache.keys();
      for (let i = 0; i < excessCount; i++) {
        const oldestKey = iteratorKeys.next().value;
        if (oldestKey !== undefined) {
          postCache.delete(oldestKey);
        } else {
          break;
        }
      }
    }
  } catch (err) {
    console.error("Failed to batch fetch posts:", err);
  }

  return postMap;
}

export function atUriToBskyUrl(uri: string): string {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return '';
  const [, did, collection, rkey] = match;
  const pathMap: Record<string, string> = {
    'app.bsky.feed.generator': 'feed',
    'app.bsky.graph.list': 'lists',
    'app.bsky.feed.post': 'post', // 参考：通常の投稿
  };
  const path = pathMap[collection];
  return path ? `https://bsky.app/profile/${did}/${path}/${rkey}` : '';
}


const profileCache = new Map<string, AppBskyActorDefs.ProfileViewDetailed>();

export async function getProfileWithCache(did: string): Promise<AppBskyActorDefs.ProfileViewDetailed | null> {
  if (profileCache.has(did)) {
    return profileCache.get(did) || null;
  }
  const profile = await getProfile(did);
  if (profile) {
    profileCache.set(did, profile);
  }
  return profile;
}

