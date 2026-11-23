import { describe, it, expect, beforeEach, vi } from 'vitest';
import { feedStore, NO_TARGET } from '../../src/lib/feedStore.svelte';

// Mock external modules
vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    updateDelayInterval: 45000,
  },
}));

vi.mock('$lib/bsky', () => ({
  getTimeline: vi.fn(),
  getMentions: vi.fn(),
  getActorLikes: vi.fn(),
  getAuthorFeed: vi.fn(),
  getPostThread: vi.fn(),
}));

vi.mock('$lib/errorStore.svelte', () => ({
  safely: vi.fn(async (fn) => {
    try {
      return typeof fn === 'function' ? await fn() : fn;
    } catch {
      return null;
    }
  }),
}));

describe('FeedStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state before each test
    feedStore.activeTab = 'timeline';
    feedStore.feeds.timeline.posts = [];
    feedStore.feeds.mentions.posts = [];
  });

  it('should have correct initial state', () => {
    expect(feedStore.activeTab).toBe('timeline');
    expect(feedStore.target).toStrictEqual(NO_TARGET);
    expect(feedStore.isFeedLoading).toBe(false);
    expect(feedStore.currentPosts).toEqual([]);
  });

  describe('currentPosts (Tab-based post retrieval)', () => {
    it('should return posts corresponding to the active tab', () => {
      feedStore.feeds.timeline.posts = [{ uri: 'at://timeline-1', actor: 'Bob' }];
      feedStore.feeds.mentions.posts = [{ uri: 'at://mention-1', actor: 'Alice' }];

      feedStore.activeTab = 'timeline';
      expect(feedStore.currentPosts).toEqual([{ uri: 'at://timeline-1', actor: 'Bob' }]);

      feedStore.activeTab = 'mentions';
      expect(feedStore.currentPosts).toEqual([{ uri: 'at://mention-1', actor: 'Alice' }]);

      feedStore.activeTab = 'settings';
      expect(feedStore.currentPosts).toEqual([]);
    });
  });

  describe('filterUnique (Private helper validation)', () => {
    it('should filter out duplicate posts based on URI and return unique list', () => {
      const storeAny = feedStore as any;

      const existing = [{ post: { uri: 'at://post-1' } }];
      const newItems = [
        { post: { uri: 'at://post-1' } }, // Duplicate
        { post: { uri: 'at://post-2' } }, // New
        { post: { uri: 'at://post-3' } }, // New with .uri format
      ];

      const result = storeAny.filterUnique(newItems, existing);
      expect(result).toEqual([
        { post: { uri: 'at://post-2' } },
        { post: { uri: 'at://post-3' } },
      ]);
    });
  });

  describe('flattenThread (Thread structuring with depth and continuation flags)', () => {
    it('should correctly flatten a thread tree with depth, continued, and continuedUp flags', async () => {
      const storeAny = feedStore as any;

      // Mock thread structure: Parent -> Root -> Reply
      const mockThreadTree = {
        post: { uri: 'at://root', cid: 'c1' },
        parent: {
          post: { uri: 'at://parent', cid: 'c0' },
        },
        replies: [
          {
            post: { uri: 'at://reply', cid: 'c2' },
          },
        ],
      };

      const flattened = storeAny.flattenThread(mockThreadTree);

      // Expected order: parent (depth -1), root (depth 0), reply (depth 1)
      expect(flattened).toHaveLength(3);

      expect(flattened[0]).toMatchObject({
        post: { uri: 'at://parent' },
        depth: -1,
      });
      expect(flattened[1]).toMatchObject({
        post: { uri: 'at://root' },
        depth: 0,
      });
      expect(flattened[2]).toMatchObject({
        post: { uri: 'at://reply' },
        depth: 1,
      });

      // Check connection flags (continued and continuedUp)
      // parent (depth -1) -> root (depth 0)
      expect(flattened[0].continued).toBe(true);
      expect(flattened[0].continuedUp).toBe(false);

      // root (depth 0) -> reply (depth 1)
      expect(flattened[1].continued).toBe(true);
      expect(flattened[1].continuedUp).toBe(true);

      // reply (depth 1) is the last item
      expect(flattened[2].continued).toBe(false);
      expect(flattened[2].continuedUp).toBe(true);
    });
  });

  describe('fetchAndAddMyLatestPost', () => {
    it('should retry fetching author feed and add the post when matched', async () => {
      const { getAuthorFeed } = await import('$lib/bsky');
      const mockGetAuthorFeed = getAuthorFeed as any;

      const targetPost = { uri: 'at://my-new-post', cid: 'cid123' };
      mockGetAuthorFeed
        .mockResolvedValueOnce({ feed: [], cursor: '' })
        .mockResolvedValueOnce({
          feed: [{ post: { uri: 'at://my-new-post', cid: 'cid123' } }],
          cursor: '',
        });

      const success = await feedStore.fetchAndAddMyLatestPost('did:plc:user', targetPost);

      expect(success).toBe(true);
      expect(feedStore.feeds.timeline.posts).toHaveLength(1);
      expect(feedStore.feeds.timeline.posts[0]).toMatchObject({
        post: { uri: 'at://my-new-post' },
      });
      expect(mockGetAuthorFeed).toHaveBeenCalledTimes(2);
    });

    it('should return false if post is not found after max retries', async () => {
      const { getAuthorFeed } = await import('$lib/bsky');
      const mockGetAuthorFeed = getAuthorFeed as any;

      mockGetAuthorFeed.mockResolvedValue({
        feed: [{ post: { uri: 'at://other-post' } }],
        cursor: '',
      });

      const targetPost = { uri: 'at://my-new-post', cid: 'cid123' };
      const success = await feedStore.fetchAndAddMyLatestPost('did:plc:user', targetPost);

      expect(success).toBe(false);
      expect(feedStore.feeds.timeline.posts).toHaveLength(0);
    });
  });
});
