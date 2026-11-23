<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { feedStore, type Author } from '$lib/feedStore.svelte';
  import { type FeedItem } from '$lib/bsky';
  import { msg, fmt } from '$lib/i18n.svelte';
  import { getDisplayName } from '$lib/bsky';
  import { formatPostHtml } from '$lib/richtext';
  import { extractEmbedImages, type EmbedImage } from '$lib/postMedia';
  import { popupEmbedImages } from '$lib/customTooltipStore.svelte';

  const DROP_DURATION_MSEC = 400;

  let {
    initialPosts = [],
    isSkipAnimation,
    myDid,
    highlightUri,
    onSelectUser,
    onOpenThread,
  } = $props();

  // ==========================================
  // State & Derived Posts (Deduping)
  // ==========================================

  // svelte-ignore state_referenced_locally
  let items = $state<FeedItem[]>(initialPosts);
  let msgs = $state({
    'like': msg.notifyLiked,
    'repost': msg.notifyRepost,
    'follow': msg.notifyFollowed,
    'like-via-repost': msg.notifyLikeViaRepost,
  });

  $effect(() => { items = initialPosts; });

  function shouldShowAuthor(author: Author): boolean {
    if (author?.viewer?.muted || author?.viewer?.blocking || author?.viewer?.blockedBy) {
      return false;
    }
    return true;
  }

  let filteredPosts = $derived.by(() => items.filter(item => shouldShowAuthor(item.post?.author)));

  let notificationsContainer = $state<HTMLDivElement | null>(null);

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
  class="notifications-container"
  bind:this={notificationsContainer}
>
  {#if filteredPosts.length === 0 || feedStore.isLoading}
    <div class="empty-state" transition:fade={{ dulation: 100 }}>
      <div class="end-dot coin-spin"></div>
    </div>
  {:else}
    {#each filteredPosts as item, index}
      {@const displayPostText = item.post?.record?.text || item.post?.value?.text}
      {@const facets = item.record?.facets || item.post?.value?.facets }
      {@const formattedPostHtml = formatPostHtml(displayPostText, facets)}
      {@const embedImages = extractEmbedImages(item.post)}
      {@const embedVideo =
        item.post?.embed?.media?.$type === 'app.bsky.embed.video#view' && item.post?.media ||
        item.post?.embed?.$type === 'app.bsky.embed.video#view' && item.post?.embed ||
        null
      }
      <div
        class="post-wrapper"
        transition:slideAndDrop={isSkipAnimation ? undefined : { duration: DROP_DURATION_MSEC, easing: cubicOut }}
      >
        <div style="display:none" aria-hidden="true" id="json_{index}">{JSON.stringify(item, null, 2)}</div>
        <div class="card notification">
          <div
            class="notification-action"
            tabindex="0"
            title={item.actor.handle}
            onclick={() => { onSelectUser(item.actor); }}
          >
            <img class="avatar" src={item.actor?.avatar}/>
            <span class="icon-base icon-{item.reason}"></span>
            <span class="notification-msg">{fmt(msgs[item.reason] || item.reason, { actor: getDisplayName(item.actor) })}</span>
          </div>
          {#if item.reason !== 'follow'}
            <div
              class="target-post"
              tabindex="0"
              onclick={() => { onOpenThread(item); }}
            >
              <img class="avatar my-avatar" src={item.post?.author?.avatar}/>
              <span class="post-text">{#if embedImages.length !== 0}<span
                class="post-media-badge icon-base icon-image image-badge"
                onmouseenter={(e) => { popupEmbedImages(embedImages, e)}}
              ></span>{/if}{#if embedVideo}<span
                class="post-media-badge icon-base icon-video"
              ></span>{/if}{@html formattedPostHtml}</span>
            </div>
          {/if}
        </div>
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
  .notifications-container {
    display: flex;
    flex-direction: column;
    touch-action: pan-y;
  }
  .post-wrapper {
    overflow: hidden;
    scroll-margin-top: var(--header-height);
  }

  .notification {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--font-lg);
  }

  .notification-action, .target-post {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    cursor: pointer;
    width: 100%;
  }
  .target-post {
    padding-left: 22px;

  }
  .notification-msg, .post-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }
  .post-media-badge {
    width: 1em;
    height: 1em;
    vertical-align: -3px;
    margin-right: 4px;
    background-color: var(--accent-color);
    cursor: pointer;
    pointer-events: auto;
  }
  .image-tooltip {
    position: fixed;
    display: none;
    background: var(--bg-card);
    border: 3px double var(--border-color);
    border-radius: var(--rad-lg);
    box-shadow: var(--box-shadow);
    overflow: hidden;
    z-index: 99999;
    pointer-events: none;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: max(200px, calc(90vw - 90px));
    max-height: max(150px, 90vh);
    animation: fadeIn var(--dur-slow);
  }

  .notifications-container:has(.image-badge:hover) .image-tooltip {
    display: inline-block;
  }

  .image-tooltip-img {
    max-width: max(200px, calc(90vw - 90px));
    max-height: calc(max(150px, 90vh) - 1em - var(--sp-xs) * 2);
    vertical-align: bottom;
  }

  .image-tooltip-count {
    color: var(--accent-color);
    display: flex;
    line-height: 1;
    justify-items: center;
    justify-content: center;
    padding: var(--sp-xs);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .fade-in-img {
    opacity: 0;
    animation: fadeIn var(--dur) ease-in-out forwards;
  }
</style>
