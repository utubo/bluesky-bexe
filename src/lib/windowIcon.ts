import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';
import { invoke } from '@tauri-apps/api/core';
import iconSrc from '../assets/icon.png';

const ICON_SIZE = 64;
const DOT_RADIUS = 10;
const DOT_OFFSET_X = 12;
const DOT_OFFSET_Y = 12;
const DOT_BORDER_WIDTH = 2.5;

let cachedImage: HTMLImageElement | null = null;

async function loadBaseIcon(): Promise<HTMLImageElement> {
  if (cachedImage) return cachedImage;

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.src = iconSrc;
    img.onload = () => {
      cachedImage = img;
      resolve(img);
    };
    img.onerror = reject;
  });
}

/**
 * Updates the window and tray icons to either the normal state or notification state (with a badge dot).
 */
export async function updateWindowIcon(dotColor?: string) {
  try {
    const win = getCurrentWindow();
    const img = await loadBaseIcon();

    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw the base icon
    ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);

    // 2. Draw the notification badge only if dotColor is specified
    if (dotColor) {
      const x = ICON_SIZE - DOT_OFFSET_X;
      const y = DOT_OFFSET_Y;

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = DOT_BORDER_WIDTH;
      ctx.stroke();
    }

    // 3. Retrieve pixel data
    const imageData = ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
    const rgbaBytes = new Uint8Array(imageData.data.buffer);

    // 4. Update window icon
    const tauriImage = await Image.new(rgbaBytes, ICON_SIZE, ICON_SIZE);
    await win.setIcon(tauriImage);
    await tauriImage.close();

    // 5. Update task tray icon with the same pixel data
    await invoke('update_tray_icon_pixels', {
      rgba: Array.from(rgbaBytes),
      width: ICON_SIZE,
      height: ICON_SIZE,
    });

  } catch (error) {
    console.error('Failed to update window and tray icons:', error);
  }
}

/**
 * Resets the window and system tray icons to the default state (no badge).
 */
export async function resetIcon() {
  await updateWindowIcon();
}
