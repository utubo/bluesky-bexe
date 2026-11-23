<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
  import { msg } from '$lib/i18n.svelte';
  import { safely } from '$lib/errorStore.svelte';
  import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { savePostImage } from '$lib/imageSave';

  const appWindow = getCurrentWindow();

  // Parse image list, index, and post information from URL parameters
  const images = $derived.by(() => {
    const urlsParam = page.url.searchParams.get('urls');
    if (urlsParam) {
      try { return JSON.parse(decodeURIComponent(urlsParam)) as string[]; } catch { return []; }
    }
    const singleUrl = page.url.searchParams.get('url');
    return singleUrl ? [singleUrl] : [];
  });

  let currentIndex = $state(
    parseInt(page.url.searchParams.get('index') || '0', 10)
  );

  const currentImageUrl = $derived(images[currentIndex] || '');

  // Restore post information
  const postData = $derived.by(() => {
    const postParam = page.url.searchParams.get('post');
    if (postParam) {
      try { return JSON.parse(decodeURIComponent(postParam)); } catch { return null; }
    }
    return null;
  });

  let isLoading = $state(true);

  // Zoom and pan states
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let isDragging = $state(false);
  let isZooming = $state(false);
  let startX = 0;
  let startY = 0;
  let zoomStartY = 0;
  let baseScale = 1;
  let baseTranslateX = 0;
  let baseTranslateY = 0;
  let downX = 0;
  let downY = 0;
  let hasZoomedOrDragged = false;

  // Auto-hide UI (counter) states
  let isUiHidden = $state(true);
  let hideTimeout: NodeJS.Timeout | null = null;
  const HIDE_UI_TIME_MSEC = 800;

  // Handle user activity to show UI and hide after a delay
  function handleUserActivity() {
    isUiHidden = false;
    if (hideTimeout) clearTimeout(hideTimeout);

    if (!isDragging) {
      hideTimeout = setTimeout(() => {
        isUiHidden = true;
      }, HIDE_UI_TIME_MSEC);
    }
  }

  // Reset state when image changes
  $effect(() => {
    if (currentImageUrl) {
      isLoading = true;
      scale = 1;
      translateX = 0;
      translateY = 0;
    }
  });

  async function handleImageLoad() {
    isLoading = false;
    try {
      await appWindow.show();
      await appWindow.setFocus();
    } catch (err) {
      console.error("Failed to show window:", err);
    }
  }

  function nextImage() {
    if (images.length <= 1) return;
    currentIndex = (currentIndex + 1) % images.length;
  }

  function prevImage() {
    if (images.length <= 1) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
  }

  // Mouse wheel zoom (inverted scroll direction)
  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    handleUserActivity();

    if (!event.ctrlKey && !(event.buttons & 2)) {
      if (event.deltaY < 0) {
        prevImage();
      } else {
        nextImage();
      }
      return;
    }

    const zoomFactor = 1.15;
    let newScale = event.deltaY > 0 ? scale * zoomFactor : scale / zoomFactor;

    newScale = Math.max(1, Math.min(newScale, 10));
    if (newScale === 1) {
      translateX = 0;
      translateY = 0;
    }
    scale = newScale;
    hasZoomedOrDragged = true;
  }

  // Start drag (left click only)
  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    isDragging = true;
    startX = event.clientX - translateX;
    startY = event.clientY - translateY;
    zoomStartY = event.clientY;
    baseScale = scale;
    baseTranslateX = translateX;
    baseTranslateY = translateY;
    downX = event.clientX; // Captured correctly here
    downY = event.clientY; // Captured correctly here
    hasZoomedOrDragged = false;
    event.preventDefault();
  }

  // Monitor mouse movement across window (left drag + right click simultaneous for zoom)
  function handleMouseMove(event: MouseEvent) {
    handleUserActivity();
    if (!isDragging) return;

    const isLeftPressed = (event.buttons & 1) !== 0;
    const isRightPressed = (event.buttons & 2) !== 0;

    if (!isLeftPressed) {
      isDragging = false;
      isZooming = false;
      return;
    }

    hasZoomedOrDragged = true;

    if (isRightPressed) {
      // Zoom mode (left click + right click simultaneous drag)
      if (!isZooming) {
        isZooming = true;
        zoomStartY = event.clientY;
        baseScale = scale;
        baseTranslateX = translateX;
        baseTranslateY = translateY;
      }

      const dy = event.clientY - zoomStartY;
      let newScale = baseScale * Math.pow(2, dy / 150);
      newScale = Math.max(1, Math.min(newScale, 10));

      if (newScale === 1) {
        translateX = 0;
        translateY = 0;
      } else {
        // Calculate distance from screen center to the initial mouse down position
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const focalX = downX - centerX;
        const focalY = downY - centerY;

        const scaleRatio = newScale / baseScale;
        
        // Keep the mouse down position fixed as the zoom anchor
        translateX = focalX - (focalX - baseTranslateX) * scaleRatio;
        translateY = focalY - (focalY - baseTranslateY) * scaleRatio;
      }
      scale = newScale;
    } else {
      // Pan mode (left click only)
      if (isZooming) {
        isZooming = false;
        startX = event.clientX - translateX;
        startY = event.clientY - translateY;
      }

      if (scale > 1) {
        translateX = event.clientX - startX;
        translateY = event.clientY - startY;
      }
    }
  }

  function handleMouseUp() {
    isDragging = false;
    isZooming = false;
    handleUserActivity();
  }

  // Double click to toggle zoom (reset or zoom into clicked position)
  function handleDoubleClick(event: MouseEvent) {
    event.preventDefault();
    if (scale === 1) {
      const newScale = 3;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;

      // Adjust translation so the clicked point remains under the cursor
      translateX = dx * (1 - newScale);
      translateY = dy * (1 - newScale);
      scale = newScale;
    } else {
      scale = 1;
      translateX = 0;
      translateY = 0;
      handleUserActivity();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    handleUserActivity();
    if (event.key === 'Escape' || event.key === 'q' || event.key === 'Q') {
      appWindow.close();
    } else if (event.key === 'r' || event.key === 'R') {
      scale = 1;
      translateX = 0;
      translateY = 0;
    } else if (event.key === 'ArrowRight' || event.key === 'l' || event.key === 'L') {
      if (scale === 1) nextImage();
    } else if (event.key === 'ArrowLeft' || event.key === 'h' || event.key === 'H') {
      if (scale === 1) prevImage();
    }
  }

  // Copy image to clipboard
  async function handleCopyImage(url: string) {
    const response = await tauriFetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(objectUrl);

    canvas.toBlob(async (pngBlob) => {
      if (!pngBlob) {
        console.error('Failed to convert image to PNG blob');
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
      } catch (clipErr) {
        console.error('Failed to write to clipboard:', clipErr);
      }
    }, 'image/png');
  }

  // Display context menu on right click
  async function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    if (hasZoomedOrDragged) {
      hasZoomedOrDragged = false;
      return;
    }
    if (!currentImageUrl) return;

    try {
      const menuItems = [];
      menuItems.push(await MenuItem.new({
        text: msg.menuSaveImage,
        action: () => {
          savePostImage({
            item: postData,
            target: null,
            imgSrc: currentImageUrl,
            imageIndex: currentIndex + 1
          });
        },
      }));

      menuItems.push(await MenuItem.new({
        text: msg.menuCopyImage,
        action: async () => {
          await safely(async() => {
            await handleCopyImage(currentImageUrl);
          });
        },
      }));

      menuItems.push(await MenuItem.new({
        text: msg.menuOpenImageWeb,
        action: async () => {
          await openUrl(currentImageUrl);
        },
      }));

      menuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));

      menuItems.push(await MenuItem.new({
        text: msg.close,
        action: async () => {
          await appWindow.close();
        },
      }));

      const menu = await Menu.new({
        items: menuItems,
      });

      await menu.popup();
    } catch (err) {
      console.error('Failed to show context menu:', err);
    }
  }

  // Register window event listeners and cleanup on destroy
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  });
</script>

<svelte:head>
  <title>{msg.viewerTitle}</title>
</svelte:head>

<main
  onwheel={handleWheel}
  onmousedown={handleMouseDown}
  oncontextmenu={handleContextMenu}
  ondblclick={handleDoubleClick}
>
  {#if currentImageUrl}
    {#if isLoading}
      <div class="loader-container">
        <div class="spinner"></div>
      </div>
    {/if}
    <img
      src={currentImageUrl}
      alt="ImageViewer"
      onload={handleImageLoad}
      class:loaded={!isLoading}
      draggable={false}
      style="transform: translate({translateX}px, {translateY}px) scale({scale}); transition: {(isDragging || isZooming) ? 'none' : 'transform 0.1s cubic-bezier(0, 0, 0.2, 1)'};"
    />

    {#if images.length > 1}
      <div class="counter" class:hidden={isUiHidden} onclick={(e) => e.stopPropagation()}>
        <button class="nav-btn" onclick={prevImage} title="Previous">‹</button>
        <span>{currentIndex + 1} / {images.length}</span>
        <button class="nav-btn" onclick={nextImage} title="Next">›</button>
      </div>
    {/if}
  {:else}
    <p class="not-found">{msg.viewerNotFound}</p>
  {/if}
</main>

<style>
  main {
    margin: 0;
    background-color: #0d1117;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    user-select: none;
    position: relative;
    cursor: default;
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity 0.2s ease-in-out, transform 0.1s cubic-bezier(0, 0, 0.2, 1);
    transform-origin: center center;
    cursor: default;
  }

  img.loaded {
    opacity: 1;
  }

  .loader-container {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .counter {
    position: absolute;
    bottom: 20px;
    background: rgba(13, 17, 23, 0.75);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 16px;
    border-radius: 20px;
    color: #fff;
    font-family: sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
    z-index: 10;
    opacity: 1;
    transition: opacity 0.3s ease-in-out;
  }

  .counter.hidden:not(:hover) {
    opacity: 0;
    pointer-events: none;
  }

  .nav-btn {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: color 0.4s;
  }

  .nav-btn:hover {
    color: var(--accent-color);
    background: transparent;
  }

  .not-found {
    color: #8b949e;
    font-family: sans-serif;
  }
</style>
