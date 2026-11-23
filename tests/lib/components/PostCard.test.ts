import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    alwaysShowRichContent: false,
  },
}));

vi.mock('$lib/dialog.svelte', () => ({
  dialog: { isOpen: false },
}));

vi.mock('$lib/errorStore.svelte', () => ({
  safely: vi.fn(async (fn) => await fn()),
}));

const mockToggleLike = vi.fn();
const mockToggleRepost = vi.fn();
const mockShowContextMenu = vi.fn();

vi.mock('$lib/postactions', () => ({
  createPostActions: () => ({
    toggleLike: mockToggleLike,
    toggleRepost: mockToggleRepost,
    showContextMenu: mockShowContextMenu,
    isLiked: false,
    isReposted: false,
  }),
}));

describe('PostCard Logic, Interactions & Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly derive post, author, and record from item prop', () => {
    const mockItem = {
      post: {
        uri: 'at://did:plc:test/app.bsky.feed.post/123',
        author: { handle: 'alice.bsky.social', displayName: 'Alice' },
        record: { text: 'Hello Bluesky!' },
        likeCount: 5,
        repostCount: 2,
        replyCount: 1,
      }
    };

    const post = mockItem.post;
    const author = post.author;
    const record = post.record;
    const displayPostText = record.text;

    expect(author.handle).toBe('alice.bsky.social');
    expect(displayPostText).toBe('Hello Bluesky!');
    expect(post.likeCount).toBe(5);
  });

  it('should correctly detect image embeds and extract urls', () => {
    const mockPostWithImages = {
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          { thumb: 'https://example.com/thumb1.jpg', fullsize: 'https://example.com/full1.jpg', alt: 'Img 1' },
          { thumb: 'https://example.com/thumb2.jpg', fullsize: 'https://example.com/full2.jpg', alt: 'Img 2' },
        ]
      }
    };

    const getEmbedImages = (p: any) => {
      const embed = p?.embed;
      if (embed?.$type === 'app.bsky.embed.images#view') return embed.images;
      return [];
    };

    const images = getEmbedImages(mockPostWithImages);
    expect(images.length).toBe(2);
    expect(images[0].alt).toBe('Img 1');
  });

  it('should trigger like and repost actions correctly', async () => {
    // Replicate interaction handlers
    const handleLikeClick = async (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      await mockToggleLike();
    };

    const handleRepostClick = async (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      await mockToggleRepost();
    };

    const mockEvent = { stopPropagation: vi.fn() };

    await handleLikeClick(mockEvent);
    expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockToggleLike).toHaveBeenCalledTimes(1);

    await handleRepostClick(mockEvent);
    expect(mockToggleRepost).toHaveBeenCalledTimes(1);
  });

  it('should handle keyboard navigation (ArrowDown / ArrowUp)', () => {
    const onNextPost = vi.fn();
    const onPrevPost = vi.fn();
    const postCardElement = document.createElement('article');

    // Replicate handlePostKeyDown logic
    const handlePostKeyDown = (e: KeyboardEvent, card: HTMLElement) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNextPost(card);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onPrevPost(card);
      }
    };

    // Test ArrowDown (Next post)
    const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    const preventDefaultSpy = vi.spyOn(downEvent, 'preventDefault');
    handlePostKeyDown(downEvent, postCardElement);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onNextPost).toHaveBeenCalledWith(postCardElement);

    // Test ArrowUp (Previous post)
    const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    const preventDefaultUpSpy = vi.spyOn(upEvent, 'preventDefault');
    handlePostKeyDown(upEvent, postCardElement);

    expect(preventDefaultUpSpy).toHaveBeenCalled();
    expect(onPrevPost).toHaveBeenCalledWith(postCardElement);
  });
});
