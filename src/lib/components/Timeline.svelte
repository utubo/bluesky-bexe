<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import PostCard from './PostCard.svelte';
  import { settingsStore } from '$lib/settingsStore.svelte';
  import { feedStore, type Author, type TabType } from '$lib/feedStore.svelte';
  import { type FeedItem } from '$lib/bsky';
  import { msg } from '$lib/i18n.svelte';

  const DROP_DURATION_MSEC = 400;

  let {
    initialPosts = [],
    isSkipAnimation,
    myDid,
    highlightUri,
    onSelectUser,
    onMoveToCompose,
  } = $props();

  // ==========================================
  // State & Derived Posts (Deduping)
  // ==========================================

  // svelte-ignore state_referenced_locally
  let posts = $state<FeedItem[]>(initialPosts);
  $effect(() => {
    posts = initialPosts;
  });

  const hasCompactPost = $derived(feedStore.activeTab === 'timeline');
  const isExpandAll = $derived(feedStore.activeTab === 'thread');

  function shouldShowAuthor(author: Author): boolean {
    if (author?.viewer?.muted || author?.viewer?.blocking || author?.viewer?.blockedBy) {
      return false;
    }
    return true;
  }

  /**
   * Determines whether a post should be displayed in the timeline or current feed.
   */
  function shouldShowPost(item: FeedItem): boolean {
    const post = item?.post;
    const author = post?.author;

    // Deleted
    if (post.deleted) {
      return false;
    }

    // Bookmark
    if (feedStore.activeTab === 'bookmarks' && !post?.viewer?.bookmarked) {
      return false;
    }

    // Always show the user's own posts
    if (author?.did === myDid) {
      return true;
    }

    // Reply from muted user
    const replyParent = item?.reply?.parent || post?.record?.reply?.parent;
    const parentAuthor = replyParent?.author;

    if (parentAuthor?.did === myDid && author?.viewer?.muted) {
      return true;
    }

    // Hide if the post author is muted or blocked
    if (!shouldShowAuthor(author)) {
      return false;
    }

    if (!parentAuthor || parentAuthor?.did === myDid) {
      return true;
    }

    // Hide if the reply parent author is muted or blocked
    if (!shouldShowAuthor(parentAuthor)) {
      return false;
    }

    if (!shouldShowAuthor(item?.actor) || item?.actor?.mutedOnlyReposts) {
      return false;
    }

    // Filter out replies to unfollowed users on the timeline tab
    if (feedStore.activeTab === 'timeline' && settingsStore.hideUnfollowedReplies) {
      const isFollowing = Boolean(parentAuthor?.viewer?.following);
      if (!isFollowing) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter out duplicate posts and separate reply parents as independent items.
   */
  let filteredPosts = $derived.by(() => {
    const seenUris = new Set<string>();
    const temp: (typeof posts[number])[] = [];

    for (let i = posts.length - 1; i >= 0; i--) {
      const item = posts[i];

      if (!shouldShowPost(item)) {
        continue;
      }

      const uri = item?.post?.uri;
      if (!uri) {
        temp.push(item);
        continue;
      }

      if (seenUris.has(uri)) {
        continue;
      }

      const parentPost = item?.reply?.parent;

      seenUris.add(uri);

      temp.push({
        ...item,
        continuedUp: !!parentPost || item.continuedUp,
        key: uri,
      });

      // Push parent post as an independent item if it exists and hasn't been handled
      if (parentPost && !item.continuedUp) {
        temp.push({
          post: parentPost,
          continued: true,
          childPostUri: item?.post?.uri,
          key: `${uri},${parentPost.uri}`,
        });
      }
    }

    const reversed = temp.reverse();
    let index = 0;
    for (const post of reversed) {
      if (post.continued) continue;
      if (index < settingsStore.expandedCount) {
        post.expanded = true;
      } else if (index < settingsStore.partialCount){
        post.partial = true;
      } else {
        break;
      }
      index ++;
    }
    return reversed;
  });

  let timelineContainer = $state<HTMLDivElement | null>(null);
  let scrollParent: HTMLElement | null = null;

  onMount(() => {
    scrollParent = timelineContainer?.parentElement;
    const focusinListener = document.addEventListener('focusin', (e) => {
      if (!timelineContainer?.contains(e.target as Node)) {
        handleOnFocus(e.target as HTMLElement);
      }
    });
    return () => {
      document.removeEventListener('focusin', focusinListener);
    };
  });

  // ==========================================
  // Post Addition & Navigation Methods
  // ==========================================

  /**
   * Immediately adds a new post to the top of the feed and preserves focus.
   */
  export async function addPostImmediately(newItem: FeedItem) {
    if (!newItem) return;
    const newUri = newItem?.post?.uri || newItem?.uri;
    if (!newUri) return;

    const isAlreadyExists = filteredPosts.some(p => (p?.post?.uri || p?.uri) === newUri);
    if (isAlreadyExists) return;

    const activeElem = document.activeElement as HTMLElement;
    const currentFocusedUri = activeElem?.closest('.post-item, [tabindex="0"]')?.getAttribute('data-uri');

    const current = feedStore.currentPosts;
    feedStore.setPostsForCurrentTab([newItem, ...current]);

    await tick();

    if (currentFocusedUri) {
      const targetElem = timelineContainer?.querySelector(`[data-uri="${currentFocusedUri}"]`) as HTMLElement;
      handleOnFocus(targetElem);
    }
  }

  export function handleMyRepost(repostedItem: FeedItem) {
    addPostImmediately(repostedItem);
  }

  export function focusFirstPost() {
    const firstPostEl = timelineContainer?.querySelector('.post.card') as HTMLElement;
    handleOnFocus(firstPostEl);
  }

  function handleOnNextPost(elem: HTMLElement) {
    if (!elem) return;
    const target = elem.parentElement?.nextElementSibling?.querySelector('.post.card') || elem.parentElement?.nextElementSibling;
    if (target) {
      handleOnFocus(target as HTMLElement);
    }
  }

  function handleOnPrevPost(elem: HTMLElement) {
    const target = elem.parentElement?.previousElementSibling?.querySelector('.post.card') || elem.parentElement?.previousElementSibling;
    if (target && (target as HTMLElement).classList?.contains('post-wrapper') || target?.closest('.post.card')) {
      handleOnFocus(target as HTMLElement);
    } else {
      onMoveToCompose();
    }
  }

  function handleOnFocus(elem: HTMLElement) {
    if (!timelineContainer) return;
    for (const card of timelineContainer.getElementsByClassName('focus')) {
      if (card !== elem) {
        card.classList.remove('focus');
      }
    }
    if (!elem) return;
    elem.classList.add('focus');
    elem.parentElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (document.activeElement !== elem) {
      elem.focus();
    }
  }

  // ==========================================
  // Custom Transition (Slide & Drop)
  // ==========================================

  function slideAndDrop(node: HTMLElement, { duration = DROP_DURATION_MSEC, easing = cubicOut }) {
    const height = node.offsetHeight;

    return {
      duration,
      css: (t: number) => {
        const eased = easing(t);
        return `
          overflow: hidden;
          height: ${eased * height}px;
          padding-top: 0;
          padding-bottom: 0;
          margin-top: 0;
          margin-bottom: 0;
          transform: translateY(-${height * (1 - eased)}px);
          opacity: ${t};
        `;
      }
    };
  }
</script>

<div
  class="timeline-container"
  bind:this={timelineContainer}
>
  {#if filteredPosts.length === 0 || feedStore.isLoading}
    <div class="empty-state" transition:fade={{ dulation: 100 }}>
      <div class="end-dot coin-spin"></div>
    </div>
  {:else}
    {#each filteredPosts as item, index (item.key)}
    {@const isExpanded = item.expanded || isExpandAll || !hasCompactPost && !item.continued }
      <div
        class="post-wrapper"
        transition:slideAndDrop={isSkipAnimation ? undefined : { duration: DROP_DURATION_MSEC, easing: cubicOut }}
      >
        <PostCard
          {item}
          {index}
          {myDid}
          {onSelectUser}
          {hasCompactPost}
          expanded={isExpanded}
          partial={!isExpanded && item.partial}
          isHighlighted={(item?.post?.uri) === highlightUri}
          onNextPost={handleOnNextPost}
          onPrevPost={handleOnPrevPost}
          onFocus={handleOnFocus}
        />
      </div>
    {/each}
    {#if !isSkipAnimation}
      <div
        class="end-of-feed"
        onclick={() => { feedStore.loadMore(); }}
      >
        <div
          class="end-dot"
          class:coin-spin={feedStore.isLoadingMore}
        ></div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    touch-action: pan-y;
  }
  .post-wrapper {
    overflow: hidden;
    scroll-margin-top: var(--header-height);
  }
</style>
