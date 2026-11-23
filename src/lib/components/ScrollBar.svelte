<script lang="ts">
  import { fade } from 'svelte/transition';
  import { msg } from '$lib/i18n.svelte';

  let { scrollTarget } = $props<{ scrollTarget: HTMLElement | null }>();

  const HIDE_DELAY_MSEC = 500;
  const FRICTION = 0.95;
  const FRICTION_SPEED = 30;
  const DROP_SLOP_PX = 5;

  let isVisible = $state(false);
  let thumbHeight = $state(40);
  let thumbTop = $state(0);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollbar = $state<HTMLSectionElement | null>(null);
  let showScrollTopButton = $state(false);

  // Shared Animation Frame ID for inertia
  let animationFrameId: number | null = null;

  // ==========================================
  // 1. Scrollbar Thumb Dragging & Inertia
  // ==========================================
  let isThumbDragging = $state(false);
  let dragStartY = 0;
  let startScrollTop = 0;
  let lastThumbPointerY = 0;
  let lastThumbTime = 0;
  let thumbVelocity = 0;

  // ==========================================
  // 2. Content Direct Drag & Flick Scrolling
  // ==========================================
  let isContentDragging = $state(false);
  let contentStartY = 0;
  let contentStartScrollTop = 0;
  let contentLastY = 0;
  let contentLastTime = 0;
  let contentVelocityY = 0;

  // Sync events and initial state with scrollTarget
  $effect(() => {
    if (!scrollTarget) return;

    updateScrollbar();
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    scrollTarget.addEventListener('pointerdown', handleContentPointerDown);
    scrollTarget.addEventListener('pointermove', handleContentPointerMove);
    scrollTarget.addEventListener('pointerup', handleContentPointerUp);
    scrollTarget.addEventListener('pointercancel', handleContentPointerUp);

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      scrollTarget.removeEventListener('pointerdown', handleContentPointerDown);
      scrollTarget.removeEventListener('pointermove', handleContentPointerMove);
      scrollTarget.removeEventListener('pointerup', handleContentPointerUp);
      scrollTarget.removeEventListener('pointercancel', handleContentPointerUp);
      cleanupTimersAndAnim();
    };
  });

  function cleanupTimersAndAnim() {
    if (hideTimer) clearTimeout(hideTimer);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }

  function updateScrollbar() {
    if (!scrollTarget || !scrollbar) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollTarget;

    scrollbar.style.setProperty('--scrollbar-top', `${scrollbar.offsetTop}px`);

    const trackHeight = scrollbar.clientHeight;

    showScrollTopButton = scrollTop > 150;

    if (scrollHeight <= clientHeight || trackHeight <= 0) {
      thumbHeight = 0;
      return;
    }

    const heightRatio = clientHeight / scrollHeight;
    thumbHeight = Math.max(trackHeight * heightRatio, 30);

    const scrollableDistance = scrollHeight - clientHeight;
    const thumbableDistance = trackHeight - thumbHeight;

    if (thumbableDistance > 0) {
      thumbTop = (scrollTop / scrollableDistance) * thumbableDistance;
    } else {
      thumbTop = 0;
    }
  }

  function handleScroll() {
    updateScrollbar();
    isVisible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      isVisible = false;
      hideTimer = null;
    }, HIDE_DELAY_MSEC);
  }

  // --- Thumb Drag Handlers ---
  function handleThumbPointerDown(e: PointerEvent) {
    if (!scrollTarget) return;
    if (e.clientY < scrollbar?.offsetTop) return;

    e.preventDefault();
    e.stopPropagation();

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    isThumbDragging = true;
    dragStartY = e.clientY;
    startScrollTop = scrollTarget.scrollTop;
    lastThumbPointerY = e.clientY;
    lastThumbTime = performance.now();
    thumbVelocity = 0;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    window.addEventListener('pointermove', handleThumbPointerMove);
    window.addEventListener('pointerup', handleThumbPointerUp);
  }

  function handleThumbPointerMove(e: PointerEvent) {
    if (!isThumbDragging || !scrollTarget || !scrollbar) return;

    const { scrollHeight, clientHeight } = scrollTarget;
    const trackHeight = scrollbar.clientHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const thumbableDistance = trackHeight - thumbHeight;

    if (thumbableDistance <= 0) return;

    const currentTime = performance.now();
    const dt = currentTime - lastThumbTime;
    const dy = e.clientY - lastThumbPointerY;

    if (dt > 0) {
      const scrollDelta = (dy / thumbableDistance) * scrollableDistance;
      thumbVelocity = scrollDelta / dt;
    }

    lastThumbPointerY = e.clientY;
    lastThumbTime = currentTime;

    const deltaY = e.clientY - dragStartY;
    const scrollDelta = (deltaY / thumbableDistance) * scrollableDistance;

    scrollTarget.scrollTop = startScrollTop + scrollDelta;
  }

  function handleThumbPointerUp() {
    const timeSinceLastMove = performance.now() - lastThumbTime;
    if (timeSinceLastMove > 50 || Math.abs(thumbVelocity) < 0.05) {
      thumbVelocity = 0;
    }

    isThumbDragging = false;
    window.removeEventListener('pointermove', handleThumbPointerMove);
    window.removeEventListener('pointerup', handleThumbPointerUp);

    if (Math.abs(thumbVelocity) > 0.1 && scrollTarget) {
      let currentVelocity = thumbVelocity * FRICTION_SPEED;

      const step = () => {
        if (!scrollTarget) return;
        currentVelocity *= FRICTION;
        scrollTarget.scrollTop += currentVelocity;

        const atTop = scrollTarget.scrollTop <= 0;
        const atBottom = scrollTarget.scrollTop >= scrollTarget.scrollHeight - scrollTarget.clientHeight;

        if (Math.abs(currentVelocity) > 0.5 && !atTop && !atBottom) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          animationFrameId = null;
        }
      };

      animationFrameId = requestAnimationFrame(step);
    }
  }

  // --- Content Direct Drag Handlers ---
  function handleContentPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !scrollTarget) return;
    if (e.clientY < scrollbar?.offsetTop) return;
    if (scrollbar && scrollbar.contains(e.target as Node)) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [data-no-drag], .image-wrapper, .action-item, .avatar, .clickable')) return;

    isContentDragging = true;
    contentStartY = e.clientY;
    contentStartScrollTop = scrollTarget.scrollTop;
    contentLastY = e.clientY;
    contentLastTime = performance.now();
    contentVelocityY = 0;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function handleContentPointerMove(e: PointerEvent) {
    if (!isContentDragging || !scrollTarget) return;
    if (window.getSelection()?.toString()) {
      isContentDragging = false;
      scrollTarget.releasePointerCapture(e.pointerId);
      return;
    }

    const deltaY = e.clientY - contentStartY;
    scrollTarget.scrollTop = contentStartScrollTop - deltaY;

    const now = performance.now();
    const dt = now - contentLastTime;
    if (dt > 0) {
      contentVelocityY = (e.clientY - contentLastY) / dt;
      contentLastY = e.clientY;
      contentLastTime = now;
    }
    if (Math.abs(contentStartY - e.clientY) > DROP_SLOP_PX) {
      scrollTarget.setPointerCapture(e.pointerId);
    }
  }

  function handleContentPointerUp(e: PointerEvent) {
    if (!isContentDragging || !scrollTarget) return;
    isContentDragging = false;
    try {
      scrollTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was not set
    }

    if (Math.abs(contentVelocityY) > 0.05) {
      let speed = contentVelocityY * FRICTION_SPEED;

      function inertiaStep() {
        if (!scrollTarget || Math.abs(speed) < 0.2) return;

        scrollTarget.scrollTop -= speed;
        speed *= FRICTION;

        animationFrameId = requestAnimationFrame(inertiaStep);
      }
      animationFrameId = requestAnimationFrame(inertiaStep);
    }
  }

  // --- Track & Wheel Handlers ---
  function handleTrackWheel(e: WheelEvent) {
    if (!scrollTarget) return;
    scrollTarget.scrollBy({
      top: (e.deltaY < 0 ? -1 : 1) * scrollTarget.clientHeight / 4,
      behavior: 'smooth'
    });
  }

  function handleTrackClick(e: MouseEvent) {
    if (!scrollTarget) return;
    if (e.clientY < scrollbar?.offsetTop) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const thumbBottom = thumbTop + thumbHeight;

    if (clickY < thumbTop) {
      scrollTarget.scrollBy({ top: -scrollTarget.clientHeight, behavior: 'smooth' });
    } else if (clickY > thumbBottom) {
      scrollTarget.scrollBy({ top: scrollTarget.clientHeight, behavior: 'smooth' });
    }
  }

  /**
   * Smoothly scrolls the target element back to the top with a heavy emphasis on
   * a soft, prolonged ease-out deceleration, avoiding any heavy ease-in feel.
   */
  export function scrollToTop() {
    cancelFliction();

    const startTop = scrollTarget.scrollTop;
    if (startTop <= 0) return;

    const startTime = performance.now();
    const duration = 600; // Slightly extended duration for a luxurious, floaty glide

    const step = (currentTime: number) => {
      if (!scrollTarget) return;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Custom ease-out biased curve: quick light start, with an extended, soft ease-out deceleration
      const ease = 1 - Math.pow(1 - progress, 4);

      scrollTarget.scrollTop = startTop * (1 - ease);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        scrollTarget.scrollTop = 0;
        animationFrameId = null;
        updateScrollbar();
      }
    };

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(step);
  }

  function cancelFliction() {
    if (!scrollTarget) return;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    contentVelocityY = 0;
    thumbVelocity = 0;
    isContentDragging = false;
    isThumbDragging = false;
  }
</script>

<div
  bind:this={scrollbar}
  class="custom-scrollbar"
  class:visible={isVisible}
  onwheel={handleTrackWheel}
  onclick={handleTrackClick}
  onpointerenter={updateScrollbar}
>
  <div
    class="custom-scrollbar-thumb"
    class:is-dragging={isThumbDragging}
    style="height: {thumbHeight}px; transform: translateY({thumbTop}px);"
    onpointerdown={handleThumbPointerDown}
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
  ></div>
</div>

{#if showScrollTopButton}
  <button
    class="scroll-to-top-btn clickable"
    onclick={scrollToTop}
    title={msg.navScrollToTop}
    transition:fade={{ duration: 150 }}
  ></button>
{/if}

<style>
.custom-scrollbar {
  position: absolute;
  right: 0px;
  width: 14px;
  z-index: 20;
  pointer-events: auto;
  height: calc(100% - var(--scrollbar-top, 0px));
  transition: opacity .2s;
  opacity: 0;
}
.custom-scrollbar:hover,
.custom-scrollbar.visible {
  opacity: 1;
}
.custom-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--text-main) 30%, transparent);
  position: absolute;
  top: 0;
  right: 4px;
  width: 10px;
  border-radius: 5px;
  z-index: 20;
  pointer-events: auto;
  transition: background-color .2s;
}
.custom-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--text-main) 50%, transparent);
}

.scroll-to-top-btn {
  position: absolute;
  bottom: 10px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: var(--accent-color);
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 15l-6-6-6 6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 20px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 10;
  opacity: 1;
}

.scroll-to-top-btn:hover {
  opacity: .4;
  background-color: var(--accent-color);
  transform: scale(1.15);
}
</style>
