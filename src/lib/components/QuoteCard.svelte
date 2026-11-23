<script lang="ts">
  import { msg } from '$lib/i18n.svelte';
  import { extractEmbedImages, openImageViewer, type EmbedImage } from '$lib/postMedia';
  import { normalizeFeedItem, type FeedItem } from '$lib/bsky';

  let {
    post,
    onOpenThread,
  }: {
    post: FeedItem;
    onOpenThread?: (item: FeedItem) => void;
  } = $props();

  // ==========================================
  // Derived Data (Quoted Post Extraction)
  // ==========================================

  const quotedPost = $derived.by(() => {
    const quotedView = post?.embed?.record || post?.embed?.media?.record;
    if (quotedView?.$type !== "app.bsky.embed.record#viewRecord") return null;
    return normalizeFeedItem(quotedView);
  });

  const displayName = $derived(quotedPost?.author?.displayName || msg.someone);
  const avatar = $derived(quotedPost?.author?.avatar);
  const rawText = $derived(typeof quotedPost?.value?.text === "string" ? quotedPost.value.text : "");

  // Extract images and GIFs for the quote using the shared utility
  const quotedEmbedImages = $derived(extractEmbedImages(quotedPost));
  let currentViewerUrl = $state<string | null>(null);

  // ==========================================
  // Event Handlers
  // ==========================================

  function handleQuoteClick(e: MouseEvent) {
    e.stopPropagation();
    if (quotedPost && onOpenThread) {
      onOpenThread(quotedPost);
    }
  }

  async function handleQuoteImageClick(e: MouseEvent, index: number) {
    e.stopPropagation();
    const imageUrls = quotedEmbedImages.map((img: EmbedImage) => img.fullsize || img.thumb).filter(Boolean);
    if (imageUrls.length === 0) return;

    // Open or toggle image viewer with state management
    currentViewerUrl = await openImageViewer(imageUrls, index, quotedPost, currentViewerUrl);
  }
</script>

{#if quotedPost}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="quote-card clickable" onclick={handleQuoteClick}>
    <div class="quote-header">
      {#if avatar}
        <img src={avatar} alt="quoted avatar" class="quote-avatar" />
      {:else}
        <div class="quote-avatar-placeholder"></div>
      {/if}
      <span class="quote-author-name">{displayName}</span>
    </div>

    {#if rawText || quotedEmbedImages.length > 0}
      <div class="quote-body">
        <p class="quote-text-paragraph">
          <span class="quote-text-content">{rawText}</span>
        </p>
      </div>
    {/if}

    {#if quotedEmbedImages.length > 0}
      <div class="quote-media-items image-grid grid-{Math.min(quotedEmbedImages.length, 4)}">
        {#each quotedEmbedImages as img, i}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="media-wrapper" onclick={(e) => handleQuoteImageClick(e, i)}>
            <img
              src={img.thumb || img.fullsize}
              alt={img.alt || 'quote media'}
              loading="lazy"
              decoding="async"
              class="fade-in-img"
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .quote-card {
    margin-top: 6px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-card-secondaly);
    font-size: 0.85rem;
    position: relative;
    z-index: 10;
  }
  .quote-card.clickable {
    cursor: pointer;
    transition: background 0.2s;
  }
  .quote-card.clickable:hover {
    background: var(--bg-card-secondaly-hover);
  }

  .quote-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .quote-avatar,
  .quote-avatar-placeholder {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
    background-color: var(--border-input);
  }
  .quote-author-name {
    font-weight: 600;
    font-size: var(--font-md);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quote-body {
    color: var(--text-main);
    opacity: 0.9;
    word-break: break-word;
  }

  .quote-text-paragraph {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }

  .quote-media-items {
    display: grid;
    gap: 4px;
    margin-top: 6px;
  }

  :global(.card.post.expanded),
  :global(.card.post.focus) {
    .quote-body {
      max-height: none;
    }
  }
</style>
