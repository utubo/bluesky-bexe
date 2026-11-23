<script lang="ts">
  import { fade } from 'svelte/transition';
  import { customTooltip } from '$lib/customTooltipStore.svelte';
  import { getDisplayName } from '$lib/bsky';

  const SLIDE_INTERVAL_MS = 1500;
  let activeIndex = $state(0);
  let waitSlideShow = $state(0);

  $effect(() => {
    const imgs = customTooltip.images;
    activeIndex = 0;

    if (imgs.length <= 1) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (activeIndex < imgs.length - 1){
        activeIndex += 1;
      } else if (waitSlideShow > 1) {
        waitSlideShow -= 1;
      } else if (waitSlideShow === 1) {
        waitSlideShow = 0;
        activeIndex = 0;
      } else {
        waitSlideShow = 3;
      }
    }, SLIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  });

  const currentImageSrc = $derived(
    customTooltip.images.length !== 0
      ? customTooltip.images[activeIndex] ?? customTooltip.images[0]
      : '',
  );

</script>


<article class="custom-tooltip">
  {#if customTooltip.images.length !== 0}
    <div class="image-tooltip">
      <img class="image-tooltip-img" src={currentImageSrc} alt="preview"/>
      {#if customTooltip.images.length > 1}
        <div class="image-tooltip-count">
          {activeIndex + 1}/{customTooltip.images.length}
        </div>
      {/if}
    </div>
  {/if}

  {#if customTooltip.profile}
    <div class="mention-tooltip">
      <div class="tooltip-header">
        {#if customTooltip.profile.avatar}
          <img src={customTooltip.profile.avatar} alt="avatar" class="tooltip-avatar" />
        {/if}
        <div class="tooltip-names">
          <div class="tooltip-display-name">{getDisplayName(customTooltip.profile)}</div>
          <div class="tooltip-handle">@{customTooltip.profile.handle}</div>
        </div>
      </div>
      {#if customTooltip.profile.description}
        <div class="tooltip-bio">{customTooltip.profile.description}</div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .custom-tooltip {
    display: none;
    position: fixed;
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

  :global(body:has(.custom-tooltip-target:hover) .custom-tooltip) {
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

  .mention-tooltip {
    padding: var(--sp-lg);
  }

  .tooltip-header {
    display: flex;
    gap: var(--sp-lg);
    align-items: center;
    margin-bottom: var(--sp-md);
  }

  .tooltip-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .tooltip-display-name {
    font-weight: bold;
  }

  .tooltip-handle {
    color: var(--text-muted);
    font-size: var(--font-xs);
  }

  .tooltip-bio {
    color: var(--text-muted);
    font-size: var(--font-xs);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
