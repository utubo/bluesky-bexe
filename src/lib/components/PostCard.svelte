<script lang="ts">
  // Svelte
  import { onMount, getContext, tick } from 'svelte';
  // External Libraries
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import Hls from 'hls.js';
  // Stores & Utilities ($lib)
  import { dialog } from '$lib/dialog.svelte';
  import { settingsStore } from '$lib/settingsStore.svelte';
  import { msg, fmt } from '$lib/i18n.svelte';
  import { safely } from '$lib/errorStore.svelte';
  import { formatPostHtml, postMentionSpan } from '$lib/richtext';
  import { formatDateTime, isSafeUrl } from '$lib/stringutils';
  import { createPostActions, POST_ACTION_OPTIONS_KEY } from '$lib/postactions';
  import {
    type FeedItem,
    type AppBskyActorDefs,
    getProfile,
    getPostLikes,
    getPostReposts,
    getDisplayName,
    getProfileWithCache,
  } from '$lib/bsky';
  import { extractEmbedImages, openImageViewer, type EmbedImage } from '$lib/postMedia';
  import { expandMochotto } from '$lib/tokimeki/mochotto';
  import { setSkipBlurScroll } from '$lib/windowState';
  import { feedStore, type TabType, type Author } from "$lib/feedStore.svelte";
  import { popupEmbedImages, popupProfile } from '$lib/customTooltipStore.svelte';
  // Types
  import type { TargetItem } from '$lib/components/ComposeBox.svelte';
  // Components
  import QuoteCard from './QuoteCard.svelte';

  let {
    item,
    index,
    expanded,
    partial,
    hasCompactPost,
    isHighlighted,
    myDid,
    onSelectUser,
    onNextPost,
    onPrevPost,
    onFocus,
  }: {
    item: FeedItem;
    index: number;
    expanded: boolean;
    partial: boolean;
    hasCompactPost: boolean;
    isHighlighted: boolean;
    myDid: string;
    onSelectUser?: (item: Author) => void;
    onNextPost?: (elem: HTMLElement) => void;
    onPrevPost?: (elem: HTMLElement) => void;
    onFocus?: (elem: HTMLElement) => void;
  } = $props();

  const { onReply, onUserReply, onQuote, onViewQuotes, onOpenThread, onSearch } = getContext<PostActionOptions>(POST_ACTION_OPTIONS_KEY);

  // ==========================================
  // State & Derived Data
  // ==========================================

  let postCard = $state<HTMLArticleElement | null>(null);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let isInView = $state(false);
  let currentViewerUrl = $state<string | null>(null);
  let isLiking = $state(false);
  let isReposting = $state(false);
  let isBookmarking = $state(false);

  const HIGHLIGHT_DELAY_MSEC = 500;

  const post = $derived(item?.post);
  const rawAuthor = $derived(post?.author);
  const record = $derived(post?.record);

  const repostActor = $derived(item?.reason?.$type === 'app.bsky.feed.defs#reasonRepost' ? item?.actor : null);

  const author = $derived(
    settingsStore.useOldRepostFormat && repostActor ? repostActor : rawAuthor
  );
  const repostPrefix = $derived.by(() => {
    if (settingsStore.useOldRepostFormat && repostActor && rawAuthor) {
      return `RP ${postMentionSpan(rawAuthor.did, `@${rawAuthor?.handle?.replace(/\.bsky\.social$/, '')}`)}: `;
    }
    return '';
  });

  // --- Interaction Counts ---
  const replyCount = $derived(post?.replyCount ?? 0);
  const likeCount = $derived(post?.likeCount ?? 0);
  const repostCount = $derived(post?.repostCount ?? 0);
  const quoteCount = $derived(post?.quoteCount ?? 0);
  let likeActors = $state<string>('');
  let repostActors = $state<string>('');
  const likedBySomeone = $derived(likeCount !== 0 && rawAuthor.did === myDid);

  // --- Body Text & Facets ---
  const displayPostText = $derived(
    typeof record?.text === "string" ? record.text :
    (typeof post?.value?.text === "string" ? post?.value?.text : "")
  );
  const facets = $derived(record?.facets || post?.value?.facets);
  let mochottoHtml = $state('')
  const formattedPostHtml = $derived(mochottoHtml || formatPostHtml(displayPostText, facets));

  // --- Embeds (External Links, Images, Videos, GIFs) ---
  const externalEmbed = $derived.by(() => {
    const embed = post?.embed;
    if (embed?.$type === "app.bsky.embed.external#view") return embed.external;
    if (embed?.media?.$type === "app.bsky.embed.external#view") return embed.media.external;
    return null;
  });

  const embedImages = $derived(extractEmbedImages(post));

  const embedVideo = $derived.by(() => {
    const embed = post?.embed;
    if (embed?.$type === "app.bsky.embed.video#view") return embed;
    if (embed?.media?.$type === "app.bsky.embed.video#view") return embed.media;
    return null;
  });

  const embedFeed = $derived.by(() => {
    const embed = post?.embed;
    if (embed?.record?.$type === "app.bsky.feed.defs#generatorView") return embed.record;
    if (embed?.record?.$type === "app.bsky.feed.defs#listView") return embed.record;
    return null;
  });

  const timestamp = $derived(post?.indexedAt || record?.createdAt);
  const formattedTime = $derived(formatDateTime(timestamp));

  const actions = createPostActions({ get item() { return item; } });

  // ==========================================
  // Lifecycle & Effects (Highlight & Video HLS)
  // ==========================================

  let isKeyDown = $state(false);

  onMount(() => {
    // 1. Window blur listener for focus management
    const handleWindowBlur = async () => {
      if (dialog.isOpen) return;
      const viewerWindow = await WebviewWindow.getByLabel('image-viewer');
      if (viewerWindow) return;
      postCard?.classList.remove('focus');
    };
    window.addEventListener('blur', handleWindowBlur);

    // 2. Window keydown/keyup listeners for interaction states
    const handleWindowKeyDown = () => { isKeyDown = true; };
    const handleWindowKeyUp = () => { isKeyDown = false; };
    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
    };
  });

  $effect(async () => {
    if (isHighlighted && postCard) {
      await tick();
      if (isHighlighted) {
        setTimeout(() => {
          postCard?.focus();
        }, HIGHLIGHT_DELAY_MSEC);
      }
    }
  });

  $effect(() => {
    if (!postCard) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isInView = entry.isIntersecting;
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(postCard);

    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    if (!videoElement || !embedVideo?.playlist || !isInView) return;

    const videoUrl = embedVideo.playlist;
    let hls: Hls | null = null;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isSafari && videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = videoUrl;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error details:', data);
      });
    } else {
      videoElement.src = videoUrl;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  });

  // ==========================================
  // Global Focus Management
  // ==========================================

  function handlePostFocusin() {
    if (!postCard) return;
    if (!isKeyDown && !postCard.classList.contains('focus')) {
      postCard.blur();
    } else {
      onFocus?.(postCard);
      if (likedBySomeone) {
        getLikeActors();
      }
    }
  }

  // NOTE: Clicking a div can trigger focusout twice; the second time has a null relatedTarget.
  let debounceFocusout = false;
  function handlePostFocusout(e: FocusEvent) {
    if (!postCard) return;
    if (!isKeyDown) return;
    if (debounceFocusout && !e.relatedTarget) return;
    debounceFocusout = true;
    setTimeout(() => debounceFocusout = false, 0);
    if (!document.hasFocus()) return;
    if (dialog.isOpen) return;
    if (e.relatedTarget && postCard.contains(e.relatedTarget as Node)) {
      return;
    }
    postCard?.classList?.remove('focus');
  }

  async function handlePostClick(e: MouseEvent) {
    if (await handlePostTextClick(e)) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('.clickable, .action-item, a, video')) return;
    if (!postCard) return;
    if (postCard.classList.contains('focus')) {
      if (!window.getSelection()?.toString()) {
        postCard.classList.remove('focus');
        postCard.blur();
      }
    } else {
      onFocus?.(postCard);
      postCard.focus();
    }
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async function openSafeUrl(url: string): Promise<boolean> {
    if (!isSafeUrl(url)) {
      console.warn('Unsafe or invalid URL blocked:', url);
      return false;
    }
    setSkipBlurScroll();
    await openUrl(url);
    return true;
  }

  async function handlePostTextClick(e: MouseEvent): Promise<boolean | void> {
    const target = (e.target as HTMLElement).closest('.clickable');
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    // 1. External link (<a> tag)
    const aTag = target.closest('a');
    if (aTag && aTag.href) {
      mochottoHtml = await expandMochotto(aTag.href, post.record, rawAuthor.did);
      if (mochottoHtml) {
        return;
      } else {
        await safely(async () => {
          await openSafeUrl(aTag.href);
        });
      }
      return true;
    }

    // 2. Mention (.post-mention)
    const mentionEl = target.closest('.post-mention');
    if (mentionEl) {
      const did = mentionEl.getAttribute('data-did');
      const handle = mentionEl.textContent?.trim();
      if (onSelectUser && did) {
        const profileAuthor = await getProfileWithCache(did);
        onSelectUser(profileAuthor || { did, handle: handle?.replace('@', '') });
      }
      return true;
    }

    // 3. Tag (.post-tag)
    const tagEl = target.closest('.post-tag');
    if (tagEl) {
      onSearch(tagEl.textContent);
      return true;
    }
  }

  async function handlePostMouseMove(e: MouseEvent) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const mentionEl = target?.closest('.post-mention');
    const did = mentionEl?.getAttribute('data-did');
    if (!did) return;
    popupProfile(did, e);
  }

  async function handleExternalCardClick(e: MouseEvent, url: string) {
    e.stopPropagation();
    if (!url) return;
    await safely(async () => {
      await openSafeUrl(url);
    });
  }

  function getAllMediaUrls() {
    let urls: string[] = [];
    if (embedImages.length > 0) {
      urls = embedImages.map((img: EmbedImage) => img.fullsize || img.thumb).filter(Boolean);
    }
    return urls;
  }

  async function handleImageClick(e: MouseEvent, index: number) {
    e.stopPropagation();
    const imageUrls = embedImages.map((img: EmbedImage) => img.fullsize || img.thumb).filter(Boolean);
    if (imageUrls.length === 0) return;
    currentViewerUrl = await openImageViewer(imageUrls, index, post, currentViewerUrl);
  }

  async function handleLikeClick(e: MouseEvent) {
    e.stopPropagation();
    if (isLiking) return;
    isLiking = true;
    try {
      await actions.toggleLike();
    } finally {
      isLiking = false;
    }
  }

  async function handleBookmarkClick(e: MouseEvent) {
    e.stopPropagation();
    if (isBookmarking) return;
    isBookmarking = true;
    try {
      await actions.toggleBookmark();
    } finally {
      isBookmarking = false;
    }
  }

  function createCountTooltip(actors: Author[], count: number): string {
    if (!actors || !count) return '';
    const csv = actors.map(actor => getDisplayName(actor)).join(', ');
    return csv + (actors.length < count ? '...' : '');
  }

  async function getLikeActors() {
    if (!likeCount) return;
    if (likeActors) return;
    try {
      const likes = await getPostLikes(post.uri);
      likeActors = createCountTooltip(likes?.map((like: FeedItem) => like.actor), likeCount);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRepostClick(e: MouseEvent) {
    e.stopPropagation();
    if (isReposting) return;
    isReposting = true;
    try {
      await actions.toggleRepost();
    } finally {
      isReposting = false;
    }
  }

  async function getRepostActors() {
    if (!repostCount) return;
    if (repostActors) return;
    try {
      const reposts = await getPostReposts(post.uri);
      repostActors = createCountTooltip(reposts, repostCount);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleContextMenu(e: MouseEvent) {
    if (!postCard) return;
    e.preventDefault();
    postCard?.classList?.add('contextmenu-popuped');
    await tick();
    await actions.showContextMenu(e);
    postCard?.classList?.remove('contextmenu-popuped');
  }

  function handlePostKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNextPost?.(postCard!);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onPrevPost?.(postCard!);
    }
  }

  function handlePostImageBadgeMouseEnter(e) {
    if (embedImages.length > 0) {
      popupEmbedImages(embedImages, e);
    }
  }
</script>

<article
  bind:this={postCard}
  class="card post"
  class:has-compact-post={hasCompactPost}
  class:expanded={expanded}
  class:partial={partial}
  class:always-rich={!item.continued && settingsStore.alwaysShowRichContent}
  class:continued={item.continued}
  class:continued-up={item.continuedUp}
  class:is-latest-in-thread={item.isLatestInThread}
  tabindex="0"
  role="region"
  data-uri={item?.post?.uri}
  onfocusin={handlePostFocusin}
  onfocusout={handlePostFocusout}
  onclick={handlePostClick}
  onmousedown={() => { isKeyDown = false; }}
  onkeydown={handlePostKeyDown}
  oncontextmenu={handleContextMenu}
>
  {#if import.meta.env.DEV}
    <div style="display:none" aria-hidden="true" id="json_{index}">{JSON.stringify(item, null, 2)}</div>
  {/if}

  <!-- Upwards Thread Line -->
  {#if item.continuedUp}
    <div class="continued-up thread-line"></div>
  {/if}

  <!-- Main Post Section -->
  <div class="main-post-wrapper">
    <div class="post-avatar-area">
      {#if author?.avatar}
        <img
          src={author.avatar}
          alt={author.handle || "avatar"}
          class="avatar"
          title={getDisplayName(author)}
          onclick={() => { onSelectUser?.(author); }}
        />
      {:else}
        <div class="avatar-placeholder"></div>
      {/if}
      {#if repostActor && !repostPrefix}
        <div class="repost-indicator"><span class=" icon-base icon-repost"></span></div>
        <img
          title={fmt(msg.repostBy, { actor: getDisplayName(repostActor) })}
          class="repost-indicator icon-base repost-avatar"
          src={repostActor.avatar}
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectUser(repostActor);
          }}
        />
      {/if}
    </div>

    <div class="post-content-area">
      {#if likedBySomeone || (repostActor && !repostPrefix)}
        <div class="indicators">
          {#if likedBySomeone}
            <div class="like-indictor" title={likeActors || msg.likedBySomeone}>
              <span class="icon-base icon-like liked-by-someone"></span>
              <span class="like-actors" class:no-actors={!likeActors}>{likeActors}</span>
            </div>
          {/if}
        </div>
      {/if}

      <div class="post-header" title={author?.handle}>
        <time class="post-time" datetime={timestamp} title={formattedTime.full}>
          {formattedTime.short}
        </time>
        <div class="author-name">
          {getDisplayName(author)}
        </div>
      </div>

      <!-- Post Body -->
      <div class="post-body">
        <div
          class="post-text"
          onkeydown={(e) => { if (e.key === 'Enter') handlePostTextClick(e); }}
          onmousemove={handlePostMouseMove}
        >
          <!-- NOTE: Do not remove whitespace between inline badge spans to avoid layout gaps -->
          <p class="post-text-paragraph">{#if embedImages.length !== 0}<span
            class="post-media-badge icon-base icon-image image-badge"
            onmouseenter={handlePostImageBadgeMouseEnter}
            onclick={(e) => { handleImageClick(e, 0); }}
          ></span>{/if}{#if embedVideo}<span
            class="post-media-badge icon-base icon-video"
          ></span>{/if}<span class="post-text-content">{@html repostPrefix}{@html formattedPostHtml}</span></p>
        </div>

        <div class="rich-content">
          <!-- External Link Preview Card -->
          {#if externalEmbed && embedImages.length === 0}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="external-card clickable" onclick={(e) => handleExternalCardClick(e, externalEmbed.uri)}>
              {#if externalEmbed.thumb}
                <div class="external-thumb-wrapper">
                  <img src={externalEmbed.thumb} alt={externalEmbed.title || 'thumbnail'} loading="lazy" />
                </div>
              {/if}
              <div class="external-info">
                <div class="external-domain">{new URL(externalEmbed.uri).hostname}</div>
                {#if externalEmbed.title}
                  <div class="external-title">{externalEmbed.title}</div>
                {/if}
                {#if externalEmbed.description}
                  <div class="external-description">{externalEmbed.description}</div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Quote Post Preview Card -->
          <QuoteCard
            {post}
            {onOpenThread}
          />

          {#if embedVideo}
            <div class="media-items">
              <div class="media-wrapper">
                <video
                  bind:this={videoElement}
                  poster={embedVideo.thumbnail}
                  controls
                  loop
                  playsinline
                  class="embed-video-player"
                ></video>
              </div>
            </div>
          {/if}

          {#if embedImages.length > 0}
            <div class="media-items image-grid grid-{Math.min(embedImages.length, 4)}">
              {#each embedImages as img, i}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="media-wrapper"
                  onclick={(e) => handleImageClick(e, i)}
                >
                  <img
                    src={img.thumb || img.fullsize}
                    alt={img.alt}
                    loading="lazy"
                    decoding="async"
                    class="fade-in-img"
                  />
                </div>
              {/each}
            </div>
          {/if}

          {#if embedFeed}
            <div
              class="external-card external-info-min"
              onclick={() => { actions.onSelectFeed({ type: 'feed', ...embedFeed }); }}
            >
              <img class="external-icon" src={embedFeed.avatar}/>
              <div class="external-title">{embedFeed.displayName}</div>
              <div class="external-description">{embedFeed.description}</div>
            </div>
          {/if}

          <div class="post-actions" tabindex="-1">
            <div class="post-action-items">
              <div class="action-item">
                <span class="tool-btn action-item-icon"
                  title={msg.menuReply}
                  onclick={() => { onReply?.(item); }}
                >
                  <span class="icon-base icon-reply no-active"></span>
                </span>
                {#if replyCount > 0 || item.continuedUp}
                  <span
                    class="tool-btn action-item-count"
                    title={msg.menuOpenThread}
                    onclick={() => onOpenThread?.(item) }
                  >{replyCount || '-'}</span>
                {/if}
              </div>

              <div class="action-item">
                <span
                  class="tool-btn action-item-icon"
                  onclick={handleRepostClick}
                  title={msg.menuRepost}
                >
                  <span
                    class="icon-base icon-repost"
                    class:no-active={!actions.isReposted}
                    class:coin-spin={isReposting}></span>
                </span>
                {#if repostCount > 0}
                  <span
                    class="tool-btn action-item-count not-highlight"
                    onclick={getRepostActors}
                  >
                    {repostCount}
                    {#if !!repostActors}
                      <span class="tooltip-count">
                        <span class="icon-base icon-repost"></span>
                        {repostActors}
                      </span>
                    {/if}
                  </span>
                {/if}
                {#if quoteCount > 0}
                  <span
                    class="tool-btn action-item-count"
                    onclick={actions.viewQuotes}
                    title={msg.menuViewQuotes}
                  >
                    ({quoteCount})
                  </span>
                {/if}
              </div>

              <div class="action-item">
                <span
                  class="tool-btn action-item-icon"
                  onclick={handleLikeClick}
                  title={msg.menuLike}
                >
                  <span
                    class="icon-base icon-like"
                    class:no-active={!actions.isLiked}
                    class:coin-spin={isLiking}></span>
                </span>
                {#if likeCount > 0}
                  <span
                    class="tool-btn action-item-count not-highlight"
                    onclick={getLikeActors}
                  >
                    {likeCount}
                    {#if !!likeActors}
                      <span class="tooltip-count">
                        <span class="icon-base icon-like"></span>
                        {likeActors}
                      </span>
                    {/if}
                  </span>
                {/if}
              </div>

              <div class="action-item">
                <span
                  class="tool-btn action-item-icon bookmark-status"
                  onclick={handleBookmarkClick}
                  title={msg.menuBookmark}
                >
                  <span
                    class="icon-base icon-bookmark"
                    class:no-active={!actions.isBookmarked}
                    class:coin-spin={isBookmarking}></span>
                </span>
              </div>

              <span
                class="tool-btn action-item post-more-btn"
                onclick={async (e) => { await actions.showContextMenu(e); }}
                title={msg.menuMoreActions}
              >
                <span class="icon-base icon-more no-active post-more-btn"></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Downwards Thread Line -->
  {#if item.continued}
    <div class="continued-line"></div>
    <div class="continued thread-line"></div>
  {/if}
</article>

<style>
  /* ==========================================
   * 1. Base Layout & Card Container
   * ========================================== */
  .card.post {
    position: relative;
    padding: var(--sp-xs) var(--sp-md);
    display: flex;
    flex-direction: column;
    transition: var(--trans-bc);
    overflow-anchor: none;
    cursor: default;
    outline: none;
  }

  .main-post-wrapper {
    position: relative;
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: var(--sp-lg);
    align-items: start;
  }

  .post-content-area {
    min-width: 0;
    flex: 1;
  }

  .card.post.continued {
    border-bottom-style: none;
  }

  .continued-line {
    position: absolute;
    left: 40px;
    display: inline-block;
    width: calc(100% - 40px);
    height: calc(100% - 4px);
    z-index: 10;
    content: '';
    border-bottom: 1px dashed var(--border-color);
    pointer-events: none;
  }

  .continued.thread-line {
    top: 16px;
    left: 22px;
  }
  .continued-up.thread-line {
    top: 0;
    left: 22px;
    height: 4px;
  }
  .has-compact-post .thread-line {
    left: 14px !important;
  }

  :global(.focus) .continued.thread-line {
    display: none !important;
  }

  /* ==========================================
   * 2. Header, Author & Metadata
   * ========================================== */
  .post-header {
    display: none;
    flex-wrap: wrap;
    align-items: center;
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .author-name {
    font-weight: bold;
    font-size: var(--font-lg);
    min-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-main);
  }

  .post-time {
    color: var(--text-muted);
    font-size: var(--font-sm);
    flex-shrink: 0;
  }

  .indicators {
    display: flex;
    gap: 4px;
    position: absolute;
    top: 4px;
    right: 0;
    line-height: 1;
    padding-left: 16px;
    align-items: center;
    background: linear-gradient(to right, transparent 0px, var(--bg-card) 16px, var(--bg-card) 100%);
    font-size: var(--font-xs);
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: .6;
  }

  .liked-by-someone {
    pointer-events: auto;
  }

  .like-actors {
    display: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--icon-color-like);
    max-width: 5em;
    opacity: 1;
    transition: opacity .5s, max-width var(--dur);
  }

  .no-actors {
    max-width: 0;
    opacity: 0;
  }

  .repost-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    cursor: pointer;
    pointer-events: auto;
    background: var(--bg-card);
    border-radius: 50%;
    z-index: 1;
    right: -4px;
    top: 9px;
    font-size: 8px;
    width: 12px;
    height: 12px;
  }

  .repost-avatar {
    opacity: 0;
    transition: var(--dur-slow);
  }

  .repost-avatar:hover {
    opacity: 1;
    transform: scale(1.2);
  }

  /* ==========================================
   * 3. Avatars & Thread Lines
   * ========================================== */
  .post-avatar-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }

  .avatar,
  .avatar-placeholder {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    background-color: var(--border-border);
    transition: var(--trans-bc);
    z-index: 1;
    cursor: pointer;
  }

  .thread-line {
    width: 0;
    height: 100%;
    min-height: 12px;
    border-left: 2px solid color-mix(in srgb, var(--text-muted) 30%, var(--bg-card));
    position: absolute;
    top: 16px;
    bottom: calc(-1 * var(--sp-md));
    z-index: 0;
    pointer-events: none;
  }

  /* ==========================================
   * 4. Body Text & Parent Styling
   * ========================================== */
  .post-body {
    cursor: default;
    outline: none;
  }

  .post-text {
    display: flex;
    flex-direction: column;
    max-width: 100%;
  }

  .post-text-paragraph {
    margin: 0;
    color: var(--text-main);
    transition: var(--trans-bc);
    max-height: 1.35em;
    word-break: break-word;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .post-text-content {
    font-size: var(--font-lg);
    line-height: 1.4;
  }

  :global(.post-link) {
    color: var(--accent-color);
    text-decoration: underline;
    cursor: pointer;
  }
  :global(.post-link:hover) {
    opacity: 0.8;
  }

  :global(.post-mention),
  :global(.post-tag) {
    color: var(--accent-color);
    cursor: pointer;
  }
  :global(.post-mention:hover),
  :global(.post-tag:hover) {
    text-decoration: underline;
  }

  /* ==========================================
   * 5. Rich Content, Media & Previews
   * ========================================== */
  .external-card {
    margin-top: var(--sp-md);
    border: 1px solid var(--border-color);
    border-radius: var(--rad-lg);
    overflow: hidden;
    background: var(--bg-card-secondaly);
    font-size: var(--font-md);
    cursor: pointer;
    transition: var(--trans-bc);
  }
  .external-card:hover {
    background: var(--bg-card-focus);
  }
  .external-thumb-wrapper img {
    width: 100%;
    max-height: 90px;
    object-fit: cover;
    display: block;
  }
  .external-info {
    padding: 8px 10px;
  }
  .external-domain {
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-transform: lowercase;
    margin-bottom: 2px;
  }
  .external-title {
    font-weight: 600;
    color: var(--text-main);
    margin-bottom: var(--sp-xs);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .external-description {
    font-size: var(--font-sm);
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .external-info-min {
    padding: 8px;
  }

  .external-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    float: left;
    margin-right: 12px;
  }

  .media-items {
    margin-top: var(--sp-md);
  }

  .image-grid {
    display: inline-grid;
    gap: var(--sp-md);
    overflow: hidden;
  }

  :global(.grid-1) { grid-template-columns: 1fr; }
  :global(.grid-2) { grid-template-columns: 1fr 1fr; }
  :global(.grid-3) { grid-template-columns: 1fr 1fr 1fr; }
  :global(.grid-4) { grid-template-columns: 1fr 1fr 1fr 1fr; }

  :global(.media-wrapper) {
    display: inline-block;
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }

  :global(.media-wrapper) :global(img) {
    border-radius: var(--rad-lg);
    max-width: 100%;
    max-height: var(--media-thumb-height-sm);
    transition: var(--trans-bc);
    display: inline-block;
  }

  @media screen and (min-width: 800px) {
    .media-wrapper img {
      max-height: var(--media-thumb-height);
    }
    .gif-external-img {
      max-height: var(--media-thumb-height);
    }
  }

  .embed-video-player {
    width: 100%;
    max-height: var(--media-thumb-height);
    display: block;
    object-fit: contain;
    border-radius: var(--rad-lg);
  }

  .post-media-badge {
    display: none;
  }

  .image-badge,
  .post-media-badge {
    width: 1em;
    height: 1em;
    vertical-align: -3px;
    margin-right: 4px;
    background-color: var(--accent-color);
    cursor: pointer;
    pointer-events: auto;
  }

  .tooltip-count {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--rad-lg);
    box-shadow: var(--box-shadow);
    padding: 3px 10px;
    font-size: var(--font-md);
    color: var(--text-main);
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tooltip-count > .icon-base {
    width: var(--icon-xs);
    height: var(--icon-xs);
  }

  .action-item-count:hover .tooltip-count {
    display: inline-block;
  }

  .fade-in-img {
    opacity: 0;
    animation: fadeIn var(--dur) ease-in-out forwards;
  }

  /* ==========================================
   * 6. Actions & Buttons
   * ========================================== */
  .post-actions {
    display: none;
  }
  .post-action-items {
    display: inline-flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-muted);
    font-size: var(--font-md);
    margin-top: 5px;
    margin-bottom: 4px;
    z-index: 2;
    position: relative;
    pointer-events: auto;
    min-width: 15em;
  }

  .action-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xs);
    transition: var(--trans-bc);
    position: relative;
    z-index: 3;
    margin: -7px -6px;
    border-radius: 9999px;
    line-height: 1;
    min-width: 2em;
  }

  .post-more-btn {
    min-width: 0;
  }

  .action-item-icon {
    cursor: pointer;
    border-radius: 50%;
  }
  .action-item-count {
    cursor: pointer;
    margin-left: -10px;
    margin-top: -1px;
  }
  .not-highlight {
    background: transparent !important;
  }

  /* ==========================================
   * 7. State Modifiers (Compact, Partial, Expanded, Focus)
   * ========================================== */

  /* Compact (Default when not expanded/partial/focus) */
  .card.post:not(.focus):not(.expanded) {
    &:not(.always-rich) {
      .rich-content {
        display: none;
      }
      &:has(.media-items) .post-media-badge {
        display: inline-block;
      }
    }
    &.continued:not(.partial):not(.has-compact-post),
    &.continued-up:not(.partial):not(.has-compact-post) {
      padding-left: 13px;
      .post-body {
        padding-left: 11px;
      }
    }
  }

  .card.post:not(.focus):has(.media-items) {
    .post-header {
      display: flex;
      height: 0;
    }
  }

  .card.post.always-rich:has(.media-items) .post-actions {
    display: flex;
  }

  /* Partial State */
  :global(.card.post.partial):not(.focus):not(.expanded) {
    .post-text {
      height: 40px;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-content: safe center;
      overflow: hidden;
    }
    &:has(.media-items).always-rich .post-text {
      height: auto;
    }
    .post-text-paragraph {
      display: -webkit-box;
      white-space: wrap;
      min-height: initial;
      max-height: initial;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
  }

  /* Expanded / Focus Common Overrides */
  :global(.card.post.expanded),
  :global(.card.post.partial),
  :global(.card.post.focus) {
    .main-post-wrapper {
      grid-template-columns: 36px 1fr;
    }

    .post-avatar-area {
      grid-column: 1;
    }

    .avatar,
    .avatar-placeholder {
      width: 36px;
      height: 36px;
      margin-top: var(--sp-xs);
      position: absolute;
    }
    .thread-line {
      min-height: 24px;
    }
    .repost-indicator {
      right: -4px;
      top: 22px;
      font-size: 10px;
      width: 18px;
      height: 18px;
    }
  }

  :global(.card.post.expanded),
  :global(.card.post.focus) {
    .post-text-paragraph {
      max-height: 100%;
      white-space: pre-wrap;
    }
    .post-actions {
      display: flex;
    }
  }

  /* Focus State Specifics */
  :global(.card.post.focus) {
    background-color: var(--bg-card-focus);
    cursor: auto;

    .like-actors {
      display: inline-block;
    }

    .post-header {
      grid-column: 2;
      display: flex;
    }

    .post-content-area > .post-body {
      grid-column: 1 / -1;
      margin-left: -44px;
      width: calc(100% + 44px);
      margin-top: var(--sp-md);
    }

    .post-actions {
      display: flex;
      justify-content: center;
    }

    .image-grid {
      width: 100%;
      display: grid;
      margin-top: var(--sp-lg);
    }

    .media-wrapper img,
    .media-wrapper video {
      max-height: var(--media-thumb-height);
      object-fit: contain;
    }

    .media-items {
      display: flex;
      justify-content: center;
      justify-items: center;
    }
  }

  :global(.card.post.contextmenu-popuped) {
    background-color: var(--bg-card-focus);
  }

  .is-latest-in-thread {
    border-bottom: 4px double var(--border-color);
  }
</style>

