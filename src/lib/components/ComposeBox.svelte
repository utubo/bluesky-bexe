<script lang="ts">
  import { tick, onMount } from 'svelte';
  import { msg, fmt } from '$lib/i18n.svelte';
  import { safely } from '$lib/errorStore.svelte';
  import { settingsStore } from '$lib/settingsStore.svelte';
  import { postText, postReply, postQuote, postWithImages } from '$lib/bsky';
  import { feedStore } from '$lib/feedStore.svelte';
  import { setSkipBlurScroll } from '$lib/windowState';
  import { type PostRef, type ReplyInfo, getDisplayName } from '$lib/bsky';
  import { slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // ==========================================
  // Types & Interfaces
  // ==========================================
  export type TargetReplyType = 'reply' | 'user_reply' | 'quote';

  export interface ComposeTarget {
    type: TargetReplyType;
    item: FeedItem;
  }

  interface AttachedImage {
    file: File;
    previewUrl: string;
  }

  let {
    composeTarget = null,
    tags = [],
    onCancel,
    onPostSuccess,
    onMoveToTimeline,
    onRemoveTag,
  }: {
    composeTarget: ComposeTarget | null;
    tags: string[];
    onCancel: () => void;
    onPostSuccess: (replyInfo?: ReplyInfo) => Promise<void> | void;
    onMoveToTimeline: () => Promise<void> | void;
    onRemoveTag: (tag: string) => void;
  } = $props();

  // ==========================================
  // State & References
  // ==========================================

  let postContent = $state("");
  let isPosting = $state(false);
  let attachedImages = $state<AttachedImage[]>([]);
  let nsfw = $state(false);

  let textareaElem = $state<HTMLTextAreaElement | null>(null);
  let fileInputElem = $state<HTMLInputElement | null>(null);


  const targetAuthor = $derived(composeTarget?.item?.post?.author || composeTarget?.item?.actor || {});

  // ==========================================
  // Content & Length Helpers
  // ==========================================

  /** Helper function to combine post content and tags */
  function buildFullContent(content: string, currentTags: string[]): string {
    if (!currentTags || currentTags.length === 0) return content;
    return content ? `${content} ${currentTags.join(' ')}` : currentTags.join(' ');
  }

  // Calculate total content including appended tags reactively
  let totalContent = $derived(buildFullContent(postContent, tags));

  // Count graphemes accurately for Bluesky 300-grapheme limit
  let postLength = $derived(
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(totalContent)].length
  );

  export function hasAny() {
    return !!postContent || attachedImages.length > 0;
  }

  export function hasText() {
    return !!postContent;
  }

  // ==========================================
  // Lifecycle & Focus Helpers
  // ==========================================

  export function focusTextarea() {
    textareaElem?.focus();
  }

  function autoResize() {
    if (!textareaElem) return;
    textareaElem.style.height = 'auto';
    if (!postContent) return;
    textareaElem.style.height = `${Math.max(textareaElem.scrollHeight, 24)}px`;
  }

  onMount(() => {
    autoResize();
  });

  // ==========================================
  // Image Handling (Select, Drop, Paste, Remove)
  // ==========================================

  function handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    addImages(Array.from(files));
    (e.target as HTMLInputElement).value = "";
  }

  export function handleDrop(e: DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;

    const imageFiles: File[] = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      addImages(imageFiles);
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }

  function addImages(files: File[]) {
    for (const file of files) {
      if (attachedImages.length >= 4) break;
      const previewUrl = URL.createObjectURL(file);
      attachedImages.push({ file, previewUrl });
    }
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(attachedImages[index].previewUrl);
    attachedImages.splice(index, 1);
  }

  // ==========================================
  // Post Submission & Key Events
  // ==========================================

  async function handlePost() {
    if (!postContent.trim() && attachedImages.length === 0) return;

    isPosting = true;
    await safely(async () => {
      let finalContent = postContent;
      let replyInfo: ReplyInfo | undefined = undefined;
      let quoteTarget = undefined;

      if (composeTarget) {
        const post = composeTarget.item.post;
        if (composeTarget.type === 'reply') {
          const parent = { uri: post.uri, cid: post.cid };
          const existingRecord = post.record as any;
          const root = existingRecord?.reply?.root || { uri: post.uri, cid: post.cid };
          replyInfo = { parent, root };
        } else if (composeTarget.type === 'user_reply') {
          const handle = targetAuthor.handle;
          if (handle && !postContent.startsWith(`@${handle}`)) {
            finalContent = `@${handle} ${finalContent}`;
          }
        } else if (composeTarget.type === 'quote') {
          quoteTarget = { uri: post.uri, cid: post.cid };
        }
        feedStore.invalidateCache('mentions');
      }

      // Use the shared builder function for final submission content
      finalContent = buildFullContent(finalContent, tags);

      const result = await (async () => {
        if (attachedImages.length > 0) {
          const imagePayloads = attachedImages.map(img => ({
            blob: img.file,
            alt: ""
          }));
          return await postWithImages(finalContent, imagePayloads, replyInfo, quoteTarget, nsfw);
        } else if (replyInfo) {
          return await postReply(finalContent, replyInfo.parent, replyInfo.root);
        } else if (quoteTarget) {
          return await postQuote(finalContent, quoteTarget);
        } else {
          return await postText(finalContent);
        }
      })();

      attachedImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
      attachedImages = [];
      postContent = '';

      await tick();
      autoResize();

      onCancel?.();
      await onPostSuccess(result);
      nsfw = false;
    }, msg.toastPostFailed);
    isPosting = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.nativeEvent?.isComposing) return;

    if (e.key === 'Enter') {
      if (settingsStore.enterToSend) {
        if (!e.shiftKey) {
          e.preventDefault();
          handlePost();
          return;
        }
      } else {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handlePost();
          return;
        }
      }
    }

    if (e.key === 'Escape') {
      if (composeTarget) {
        e.preventDefault();
        onCancel?.();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (!textareaElem) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        return;
      }

      const startPos = textareaElem.selectionStart;
      const text = textareaElem.value;
      const textAfterCursor = text.slice(startPos);

      if (!textAfterCursor.includes('\n')) {
        requestAnimationFrame(() => {
          if (!textareaElem) return;
          const endPos = textareaElem.selectionStart;
          if (startPos === endPos) {
            onMoveToTimeline();
          }
        });
      }
      return;
    }
  }

  // ==========================================
  // Derived Preview Data
  // ==========================================

  let previewData = $derived.by(() => {
    if (!composeTarget) return null;
    const post = composeTarget.item.post;
    const authorName = getDisplayName(targetAuthor);
    const avatarUrl = targetAuthor.avatar;
    const textSnippet = composeTarget.type !== 'user_reply' && post?.record?.text || "";

    let title = "";
    if (composeTarget.type === 'reply') title = fmt(msg.composerBannerReply, { authorName });
    else if (composeTarget.type === 'user_reply') title = fmt(msg.composerBannerUserReply, { authorName });
    else if (composeTarget.type === 'quote') title = fmt(msg.composerBannerQuote, { authorName });

    const isNotMutualFollow =
      targetAuthor.did !== feedStore.myDid &&
      composeTarget.type !== 'quote' &&
      targetAuthor.viewer &&
      (!targetAuthor.viewer.following || !targetAuthor.viewer.followedBy);

    return {
      title,
      avatarUrl,
      textSnippet: textSnippet ? `${textSnippet.slice(0, 40)}...` : "",
      isNotMutualFollow
    };
  });
</script>

<section class="compose-box">
  {#if composeTarget && previewData}
    <div out:slide={{ duration: 130, delay: 120, ease: cubicOut }}>
      <div
        class="target-banner"
        class:warning={previewData.isNotMutualFollow}
        in:fly={{ x: -50, duration: 120, delay: 80, ease: cubicOut }}
        out:fly={{ x: -50, duration: 120, ease: cubicOut }}
      >
        <div class="target-left">
          {#if previewData.avatarUrl}
            <img src={previewData.avatarUrl} class="target-avatar" alt="avatar" />
          {:else}
            <div class="target-avatar-fallback"></div>
          {/if}
          <div class="target-meta">
          <span class="target-title">
            {#if previewData.isNotMutualFollow}
              <span class="icon-base icon-not-mutual" title={msg.composerBannerNotMutual}></span>
            {/if}
          {previewData.title}
          </span>
            {#if previewData.textSnippet}
              <span class="target-snippet">{previewData.textSnippet}</span>
            {/if}
          </div>
        </div>
        <button type="button" class="cancel-btn" onclick={onCancel} title={msg.composerCancel}>
          <span class="icon-base icon-close" style="width: 16px; height: 16px;"></span>
        </button>
      </div>
    </div>
  {/if}

  {#if attachedImages.length > 0}
    <div class="attached-images-preview">
      {#each attachedImages as img, idx}
        <div class="thumb-wrapper">
          <img src={img.previewUrl} alt="attachment" />
          <button type="button" class="remove-thumb-btn" onclick={() => removeImage(idx)} title={msg.composerRemoveImage}>
            <span class="icon-base icon-close" style="width: 12px; height: 12px; stroke-width: 3;"></span>
          </button>
        </div>
      {/each}
      <button
        type="button"
        class="tool-btn nsfw-btn"
        class:active={nsfw}
        onclick={() => { nsfw = !nsfw }}
        title={msg.composerNSFW}
      >
        <span class="icon-base icon-nsfw"></span>
      </button>
    </div>
  {/if}

  {#if tags.length !== 0}
    <div class="tag-container">
    {#each tags as tag}
      <button
        type="button"
        class="tool-btn tag"
        title={`${tag}\n${msg.composerRemoveTag}`}
        onclick={() => { onRemoveTag(tag); }}
      >{tag}</button>
      {/each}
    </div>
  {/if}

  <div class="compose-input-container">
    <div class="left-side">
      <textarea
        bind:this={textareaElem}
        bind:value={postContent}
        oninput={autoResize}
        onkeydown={handleKeydown}
        onpaste={handlePaste}
        placeholder={
          `${settingsStore.enterToSend ? msg.composerPlaceholderEnter : msg.composerPlaceholderNormal}` +
          " / " +
          `${composeTarget ? msg.composerPlaceholderEsc : msg.composerPlaceholderAltR}`
        }
        rows="1"
        disabled={isPosting}
      ></textarea>

      {#if postLength > 200}
        <div class="post-length-footer">
          <div class="post-length" class:exceeded={postLength > 300}>
            {postLength}/300
          </div>
        </div>
      {/if}
    </div>
    <button
      type="button"
      class="tool-btn"
      onclick={() => {
        setSkipBlurScroll();
        fileInputElem?.click();
      }}
      title={msg.composerSelectImage}
      disabled={attachedImages.length >= 4}
    ><span class="icon-base icon-image"></span></button>
    <input
      type="file"
      accept="image/*"
      multiple
      bind:this={fileInputElem}
      onchange={handleFileSelect}
      style="display: none;"
    />
  </div>
</section>

<style>
  .compose-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
    border-bottom: 1px solid var(--border-color);
  }

  .target-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--text-main) 5%, var(--bg-card));
    border-radius: 6px;
    border-left: 3px solid var(--accent-color);
    gap: 8px;
  }
  .target-banner.warning {
    border-left-color: var(--text-muted);
  }
  .target-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }
  .target-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .target-avatar-fallback {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--border-input);
    flex-shrink: 0;
  }
  .target-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .target-title {
    font-weight: 600;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .target-snippet {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
    font-size: 11px;
  }
  .cancel-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s, color 0.2s;
    flex-shrink: 0;
  }
  .cancel-btn:hover {
    background-color: var(--bg-gray-hover);
    color: var(--text-main);
  }

  .attached-images-preview {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .thumb-wrapper {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--border-color);
  }
  .thumb-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .remove-thumb-btn {
    position: absolute;
    top: 3px;
    right: 3px;
    background: #000c;
    color: white;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.2s;
  }
  .remove-thumb-btn:hover {
    background: var(--danger-color);
  }

  .compose-input-container {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .left-side {
    flex: 1;
  }
  textarea {
    resize: none;
    overflow-y: hidden;
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: var(--text-main);
    outline: none;
    font-family: inherit;
    line-height: 1.5;
    padding: 4px 0;
    min-height: calc(1.4em + 4px);
    max-height: 120px;
  }

  textarea::placeholder {
    color: var(--text-muted);
    opacity: 0.7;
  }

  .post-length-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 4px;
  }

  .post-length {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .post-length.exceeded {
    color: var(--danger-color);
    font-weight: 600;
  }

  .tool-btn {
    margin-bottom: 2px;
  }

  .tool-btn .icon-base {
    width: 18px;
    height: 18px;
  }

  .tag-container {
    display: flex;
    gap: 4px;
    flex-direction: row;
  }

  .tool-btn.tag {
    display: inline-block;
    font-size: 0.8rem;
    color: var(--accent-color);
    background-color: var(--bg-input);
    padding: 2px 8px;
    max-width: 8em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag:hover, .tag:focus {
    background-color: var(--bg-btn-hover);
  }

  .nsfw-btn {
    display: flex;
    align-items: end;
    padding: 0px;
    background: none !important;
  }

  .tool-btn.nsfw-btn:hover, .tool-btn.nsfw-btn:focus {
    background-color: var(--bg-gray-hover);
    color: var(--text-main);
  }
</style>
