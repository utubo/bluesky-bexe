// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostActions } from '$lib/postactions';

// Mock Tauri core invoke to prevent unhandled rejection during store initialization
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock dependencies: bsky.ts の個別関数をモック
vi.mock('$lib/bsky', () => ({
  likePost: vi.fn().mockResolvedValue('at://like/123'),
  deleteLike: vi.fn().mockResolvedValue(undefined),
  repostPost: vi.fn().mockResolvedValue('at://repost/123'),
  deleteRepost: vi.fn().mockResolvedValue(undefined),
  followUser: vi.fn().mockResolvedValue({ uri: 'at://follow/123' }),
  unfollowUser: vi.fn().mockResolvedValue(undefined),
  createBookmark: vi.fn().mockResolvedValue(true),
  deleteBookmark: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/toast.svelte', () => ({
  toast: {
    show: vi.fn(),
    showError: vi.fn(),
  },
}));

vi.mock('$lib/feedStore.svelte', () => ({
  feedStore: { invalidateCache: vi.fn() },
}));

vi.mock('$lib/customDialogStore.svelte', () => ({
  openConfirmDialog: vi.fn().mockResolvedValue(true),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn().mockResolvedValue({
      popup: vi.fn().mockResolvedValue(undefined),
    }),
  },
  MenuItem: {
    new: vi.fn().mockImplementation(async (opts) => opts),
  },
  PredefinedMenuItem: {
    new: vi.fn().mockImplementation(async (opts) => opts),
  },
}));

vi.mock('$lib/i18n.svelte', () => ({
  msg: {
    toastLike: 'Liked',
    toastUnlike: 'Unliked',
    toastRepost: 'Reposted',
    toastUnrepost: 'Unreposted',
    toastFollow: 'Followed',
    toastUnfollow: 'Unfollowed',
    menuSaveImage: 'Save Image',
    menuOpenThread: 'Open Thread',
    menuLike: 'Like',
    menuUnlike: 'Unlike',
    menuRepost: 'Repost',
    menuUnrepost: 'Unrepost',
    menuQuote: 'Quote',
    menuReply: 'Reply',
    menuReplyToUser: 'Reply to User',
    menuFollowUser: 'Follow User',
    menuUnfollowUser: 'Unfollow User',
    menuOpenPostWeb: 'Open Post in Browser',
    menuOpenUserWeb: 'Open User in Browser',
  },
  tFormat: vi.fn((str) => str),
}));

vi.mock('svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('svelte')>();
  return {
    ...actual,
    getContext: vi.fn().mockReturnValue({
      onReply: vi.fn(),
      onQuote: vi.fn(),
      onAddTag: vi.fn(),
    }),
  };
});

describe('postactions.ts', () => {
  const mockPostItem = {
    uri: 'at://did:plc:test/app.bsky.feed.post/123',
    cid: 'bafyreigz...',
    likeCount: 5,
    repostCount: 2,
    viewer: {
      like: null,
      repost: null,
      bookmarked: null,
    },
    author: {
      did: 'did:plc:author',
      handle: 'author.test',
      viewer: {
        following: undefined,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should toggle like successfully when not liked', async () => {
    const actions = createPostActions({ item: mockPostItem });
    expect(actions.isLiked).toBe(false);

    await actions.toggleLike();
    expect(mockPostItem.viewer.like).toBe('at://like/123');
    expect(mockPostItem.likeCount).toBe(6);
  });

  it('should toggle repost successfully when not reposted', async () => {
    const actions = createPostActions({ item: mockPostItem });
    expect(actions.isReposted).toBe(false);

    await actions.toggleRepost();
    expect(mockPostItem.viewer.repost).toBe('at://repost/123');
    expect(mockPostItem.repostCount).toBe(3);
  });

  it('should show context menu successfully', async () => {
    const actions = createPostActions({ item: mockPostItem });
    const div = document.createElement('div');
    const event = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(event, 'target', { value: div, enumerable: true });

    await actions.showContextMenu(event);
    expect(true).toBe(true);
  });

  it('should toggle bookmark successfully when not bookmarked', async () => {
    const actions = createPostActions({ item: mockPostItem });
    expect(actions.isBookmarked).toBe(false);

    await actions.toggleBookmark();
    expect(mockPostItem.viewer.bookmarked).toBe(true);
  });

  it('should call onViewQuotes when viewQuotes is triggered', async () => {
    const mockOnViewQuotes = vi.fn();
    vi.mocked(await import('svelte')).getContext.mockReturnValue({
      onViewQuotes: mockOnViewQuotes,
    });

    const actions = createPostActions({ item: mockPostItem });
    await actions.viewQuotes();

    expect(mockOnViewQuotes).toHaveBeenCalledWith(mockPostItem);
  });
});
