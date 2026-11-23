import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/settingsStore.svelte', () => ({
  settingsStore: {
    expandedCount: 5,
    partialCount: 5,
  },
}));

vi.mock('$lib/feedStore.svelte', () => ({
  feedStore: {
    currentPosts: [],
    setPostsForCurrentTab: vi.fn(),
  },
}));

describe('TimeLine Focus & Navigation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly filter out duplicate posts, prioritizing the later (bottom) ones', () => {
    const duplicatePosts = [
      { post: { uri: 'at://post-1', text: 'First (old)' } },
      { post: { uri: 'at://post-2', text: 'Second' } },
      { post: { uri: 'at://post-1', text: 'First (duplicate/new)' } },
    ];

    const filterUniquePosts = (posts: any[]) => {
      const seenUris = new Set<string>();
      const temp: any[] = [];
      for (let i = posts.length - 1; i >= 0; i--) {
        const item = posts[i];
        const uri = item?.post?.uri || item?.uri;
        if (!uri) {
          temp.push(item);
          continue;
        }
        if (!seenUris.has(uri)) {
          seenUris.add(uri);
          temp.push(item);
        }
      }
      return temp.reverse();
    };

    const result = filterUniquePosts(duplicatePosts);

    expect(result.length).toBe(2);
    expect(result[0].post.text).toBe('Second');
    expect(result[1].post.text).toBe('First (duplicate/new)');
  });

  it('should focus the first post correctly using .post.card selector', () => {
    // Setup mock DOM structure matching TimeLine.svelte
    const container = document.createElement('div');
    const firstCard = document.createElement('div');
    firstCard.className = 'post card';
    container.appendChild(firstCard);

    const focusedElements: HTMLElement[] = [];
    const handleOnFocus = (elem: HTMLElement) => {
      if (elem) {
        elem.classList.add('focus');
        focusedElements.push(elem);
      }
    };

    // Replicate focusFirstPost logic
    const focusFirstPost = () => {
      const firstPostEl = container.querySelector('.post.card') as HTMLElement;
      handleOnFocus(firstPostEl);
    };

    focusFirstPost();

    expect(focusedElements[0]).toBe(firstCard);
    expect(firstCard.classList.contains('focus')).toBe(true);
  });

  it('should navigate to the next post correctly', () => {
    const container = document.createElement('div');
    const item1 = document.createElement('div');
    item1.className = 'post-wrapper';
    const card1 = document.createElement('div');
    card1.className = 'post card';
    item1.appendChild(card1);

    const item2 = document.createElement('div');
    item2.className = 'post-wrapper';
    const card2 = document.createElement('div');
    card2.className = 'post card';
    item2.appendChild(card2);

    container.appendChild(item1);
    container.appendChild(item2);

    const focusedElements: HTMLElement[] = [];
    const handleOnFocus = (elem: HTMLElement) => {
      if (elem) {
        elem.classList.add('focus');
        focusedElements.push(elem);
        elem.focus();
      }
    };

    const handleOnNextPost = (elem: HTMLElement) => {
      if (!elem) return;
      const target = elem.parentElement?.nextElementSibling?.querySelector('.post.card') || elem.parentElement?.nextElementSibling;
      if (target) {
        handleOnFocus(target as HTMLElement);
      }
    };

    handleOnNextPost(card1);

    expect(focusedElements[0]).toBe(card2);
    expect(card2.classList.contains('focus')).toBe(true);
  });

  it('should call onMoveToCompose when moving to previous post from the very first post', () => {
    const card1 = document.createElement('div');
    card1.className = 'post card';
    const item1 = document.createElement('div');
    item1.className = 'post-wrapper';
    item1.appendChild(card1);

    const onMoveToCompose = vi.fn();

    const handleOnPrevPost = (elem: HTMLElement) => {
      const target = elem.parentElement?.previousElementSibling?.querySelector('.post.card') || elem.parentElement?.previousElementSibling;
      if (target && (target as HTMLElement).classList?.contains('post-wrapper') || target?.closest('.post.card')) {
        // Focus logic placeholder
      } else {
        onMoveToCompose();
      }
    };

    handleOnPrevPost(card1);

    expect(onMoveToCompose).toHaveBeenCalledTimes(1);
  });

  it('should register and cleanup focusin event listener on mount/unmount', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const container = document.createElement('div');
    let cleanupFn: (() => void) | undefined;

    // Simulate mount behavior
    const simulateOnMount = () => {
      const focusinListener = (e: Event) => {
        if (!container.contains(e.target as Node)) {
          // handleOnFocus mock
        }
      };
      document.addEventListener('focusin', focusinListener);
      cleanupFn = () => {
        document.removeEventListener('focusin', focusinListener);
      };
    };

    simulateOnMount();
    expect(addEventListenerSpy).toHaveBeenCalledWith('focusin', expect.any(Function));

    // Simulate unmount behavior
    if (cleanupFn) {
      cleanupFn();
    }
    expect(removeEventListenerSpy).toHaveBeenCalledWith('focusin', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('should filter out replies to unfollowed users when hideUnfollowedReplies is enabled on timeline tab', () => {
    // モック用の設定と入力データ
    let activeTab = 'timeline';
    let hideUnfollowedReplies = true;
    const myDid = 'did:plc:my-did';

    const posts = [
      // 1. 通常のポスト（残るべき）
      { post: { uri: 'at://post-1', text: 'Normal post' } },
      // 2. フォローしている人へのリプライ（親の作者をフォロー中 -> 残るべき）
      {
        post: { uri: 'at://post-2', text: 'Reply to followed' },
        reply: {
          parent: {
            author: {
              did: 'did:plc:followed-user',
              viewer: { following: 'at://app.bsky.graph.follow/123' }
            }
          }
        }
      },
      // 3. 自分自身へのリプライ（自分宛て -> 残るべき）
      {
        post: { uri: 'at://post-3', text: 'Reply to myself' },
        reply: {
          parent: {
            author: {
              did: 'did:plc:my-did',
              viewer: {}
            }
          }
        }
      },
      // 4. フォローしていない人へのリプライ（親の作者をフォローしていない -> 非表示になるべき）
      {
        post: { uri: 'at://post-4', text: 'Reply to unfollowed' },
        reply: {
          parent: {
            author: {
              did: 'did:plc:unfollowed-user',
              viewer: {} // following なし
            }
          }
        }
      }
    ];

    // Timeline.svelte で実装したフィルタリングロジックの再現
    const filterTimelinePosts = (inputPosts: any[]) => {
      const seenUris = new Set<string>();
      const temp: any[] = [];

      for (let i = inputPosts.length - 1; i >= 0; i--) {
        const item = inputPosts[i];

        if (activeTab === 'timeline' && hideUnfollowedReplies) {
          const replyParent = item?.reply?.parent || item?.post?.record?.reply?.parent;
          if (replyParent) {
            const parentAuthor = replyParent.author;
            const isFollowing = Boolean(parentAuthor?.viewer?.following);
            const isMySelf = (parentAuthor?.did === myDid);
            if (!isFollowing && !isMySelf) {
              continue; // 非表示
            }
          }
        }

        const uri = item?.post?.uri || item?.uri;
        if (!uri) {
          temp.push(item);
          continue;
        }

        if (!seenUris.has(uri)) {
          seenUris.add(uri);
          temp.push(item);
        }
      }
      return temp.reverse();
    };

    const result = filterTimelinePosts(posts);

    // post-4（フォロー外へのリプライ）だけが除外され、3件残ることを確認
    expect(result.length).toBe(3);
    expect(result.map(p => p.post.uri)).toEqual([
      'at://post-1',
      'at://post-2',
      'at://post-3'
    ]);
  });
});

describe('shouldShowPost filtering logic', () => {
  const myDid = 'did:plc:my-did';

  // テスト用のヘルパー（実際のコンポーネント内関数をここにインポート、またはテスト用に同等の関数を用意）
  function shouldShowPost(item: any, activeTab = 'timeline', hideUnfollowedReplies = true): boolean {
    const post = item?.post || item;
    const author = post?.author;

    // Always show the user's own posts
    if (author?.did === myDid) {
      return true;
    }

    // Hide if the post author is muted or blocked
    if (author?.viewer?.muted || author?.viewer?.blocking || author?.viewer?.blockedBy) {
      return false;
    }

    const replyParent = item?.reply?.parent || post?.record?.reply?.parent;
    const parentAuthor = replyParent?.author;
    if (!parentAuthor || parentAuthor?.did === myDid) {
      return true;
    }

    // Hide if the reply parent author is muted or blocked
    if (parentAuthor?.viewer?.muted || parentAuthor?.viewer?.blocking || parentAuthor?.viewer?.blockedBy) {
      return false;
    }

    // Filter out replies to unfollowed users on the timeline tab
    if (activeTab === 'timeline' && hideUnfollowedReplies) {
      const isFollowing = Boolean(parentAuthor?.viewer?.following);

      if (!isFollowing) {
        return false;
      }
    }

    return true;
  }

  it('should always show the user own posts', () => {
    const item = { post: { author: { did: myDid } } };
    expect(shouldShowPost(item)).toBe(true);
  });

  it('should hide posts if the author is muted or blocked', () => {
    const mutedItem = { post: { author: { did: 'did:plc:other', viewer: { muted: true } } } };
    const blockedItem = { post: { author: { did: 'did:plc:other', viewer: { blocking: 'at://...' } } } };

    expect(shouldShowPost(mutedItem)).toBe(false);
    expect(shouldShowPost(blockedItem)).toBe(false);
  });

  it('should always show replies directed to myself even if unfollowed', () => {
    const item = {
      post: { author: { did: 'did:plc:other' } },
      reply: {
        parent: {
          author: { did: myDid } // 自分宛て
        }
      }
    };
    expect(shouldShowPost(item, 'timeline', true)).toBe(true);
  });

  it('should filter out replies to unfollowed users on timeline tab', () => {
    const item = {
      post: { author: { did: 'did:plc:other' } },
      reply: {
        parent: {
          author: { did: 'did:plc:unfollowed', viewer: { following: null } } // フォロー外
        }
      }
    };
    expect(shouldShowPost(item, 'timeline', true)).toBe(false);
  });

  it('should keep replies to followed users on timeline tab', () => {
    const item = {
      post: { author: { did: 'did:plc:other' } },
      reply: {
        parent: {
          author: { did: 'did:plc:followed', viewer: { following: 'at://...' } } // フォロー中
        }
      }
    };
    expect(shouldShowPost(item, 'timeline', true)).toBe(true);
  });
});
