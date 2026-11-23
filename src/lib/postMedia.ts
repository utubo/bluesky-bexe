import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { safely } from '$lib/errorStore.svelte';

export interface EmbedImage {
  fullsize: string;
  thumb: string;
};

/**
 * Extract image embed arrays (including standard image embeds and external GIF cards)
 * from a post or quote view data.
 */
export function extractEmbedImages(target: any): any[] {
  if (!target) return [];

  // Support both direct post objects and inner record objects
  const embed = target?.embed;
  const embeds = target?.embeds || target?.value?.embeds;

  // 1. Check for embeds array (e.g., quote view records)
  if (Array.isArray(embeds)) {
    for (const emb of embeds) {
      if (emb.$type === "app.bsky.embed.images#view") return emb.images;
      if (emb.media?.$type === "app.bsky.embed.images#view") return emb.media.images;
    }
  }

  // 2. Check for single embed object
  if (embed?.$type === "app.bsky.embed.images#view") return embed.images;
  if (embed?.$type === "app.bsky.embed.gallery#view") return embed.items;
  if (embed?.media?.$type === "app.bsky.embed.images#view") return embed.media.images;

  // 3. Check for external GIF cards
  const external = embed?.$type === "app.bsky.embed.external#view"
    ? embed.external
    : (embed?.media?.$type === "app.bsky.embed.external#view" ? embed.media.external : null);

  if (external?.uri) {
    const uri = external.uri;
    if (
      uri.endsWith('.gif') ||
      uri.includes('giphy.com') ||
      uri.includes('tenor.com') ||
      uri.includes('klipy.com')
    ) {
      return [{
        thumb: uri,
        fullsize: uri,
        alt: external.title || 'GIF'
      }];
    }
  }

  return [];
}

/**
 * Open the dedicated image viewer window with toggle support.
 * Returns the selected URL if opened, or null if toggled closed.
 */
export async function openImageViewer(
  imageUrls: string[],
  selectedIndex: number,
  targetPost: any,
  currentViewerUrl: string | null
): Promise<string | null> {
  const selectedUrl = imageUrls[selectedIndex];
  if (!selectedUrl) return null;

  return await safely(async () => {
    const windowLabel = 'image-viewer';
    const existing = await WebviewWindow.getByLabel(windowLabel);
    if (existing) {
      await existing.close();
      if (currentViewerUrl === selectedUrl) {
        return null; // Toggled off
      }
    }

    const urlsParam = encodeURIComponent(JSON.stringify(imageUrls));
    const postParam = encodeURIComponent(JSON.stringify(targetPost));
    const viewerUrl = `/image-viewer?urls=${urlsParam}&index=${selectedIndex}&post=${postParam}`;

    new WebviewWindow(windowLabel, {
      url: viewerUrl,
      title: selectedUrl,
      width: 900,
      height: 900,
      center: true,
      visible: false,
    });

    return selectedUrl;
  }) || null;
}
