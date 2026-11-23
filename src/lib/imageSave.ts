import { ask, save } from '$lib/dialog.svelte';
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { dirname } from '@tauri-apps/api/path';
import { safely } from '$lib/errorStore.svelte';
import { msg, fmt } from '$lib/i18n.svelte';
import { toast } from '$lib/toast.svelte';
import { settingsStore, DEFAULT_IMAGE_FILENAME_FORMAT } from '$lib/settingsStore.svelte';
import { sanitizeFileName } from '$lib/stringutils';

const FILENAME_TEXT_LIMIT = 10;

export interface SaveImageParams {
  item: any;
  imgSrc: string;
  imageIndex?: number;
}

function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'png';
    if (pathname.endsWith('.gif')) return 'gif';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg';
    if (pathname.endsWith('.webp')) return 'webp';
  } catch {}

  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.gif')) return 'gif';
  if (lower.includes('.jpeg') || lower.includes('.jpg')) return 'jpg';
  return 'webp';
}

function extractMetadata(item: any, specifiedIndex?: number) {
  const post = item?.post?.record || item?.post || item || {};
  const author = item?.post?.author || item?.author || {};

  const displayName = sanitizeFileName(author.displayName || author.handle, 'user');
  const handle = sanitizeFileName(author.handle, 'handle');

  const timestamp = new Date(post.indexedAt || post.createdAt || Date.now());
  const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = timestamp.toISOString().slice(11, 19).replace(/:/g, '');

  const imageIndex = String(specifiedIndex ?? 1);

  const textSource = post.text || post.value?.text || post.record?.text || '';
  const snippet = sanitizeFileName(
    textSource
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, FILENAME_TEXT_LIMIT),
    ''
  );

  return { displayName, handle, date: dateStr, time: timeStr, index: imageIndex, snippet };
}

function buildDefaultPath(params: SaveImageParams): string {
  const { item, imgSrc, imageIndex } = params;
  const metadata = extractMetadata(item, imageIndex);
  const format = settingsStore.imageFileNameFormat || DEFAULT_IMAGE_FILENAME_FORMAT;

  const evaluatedFileName = format.replace(
    /\{displayName\}|\{handle\}|\{date\}|\{time\}|\{index\}|\{snippet\}/g,
    (match) => {
      const key = match.slice(1, -1) as keyof typeof metadata;
      return metadata[key] ?? match;
    }
  );

  const sanitizedFileName = evaluatedFileName.replace(/[\r\n]/g, '').trim();
  const extension = getExtensionFromUrl(imgSrc);

  return `${sanitizedFileName}.${extension}`;
}

async function ensureDirectoryExists(filePath: string): Promise<void> {
  const parentDir = await dirname(filePath);
  if (!parentDir || parentDir === '.' || parentDir === '') return;

  try {
    const dirExists = await exists(parentDir);
    if (!dirExists) {
      const confirmed = await ask(
        fmt(msg.dlgDirNotFoundMessage, { dir: parentDir }),
        {
          title: msg.dlgDirNotFoundTitle,
          okLabel: msg.dlgDirNotFoundOk,
          cancelLabel: msg.dlgDirNotFoundCancel,
        }
      );
      if (confirmed) {
        await mkdir(parentDir, { recursive: true });
      }
    }
  } catch (e) {
    console.error('Failed to handle parent directory:', e);
  }
}

export async function savePostImage(params: SaveImageParams) {
  await safely(async () => {
    const defaultPath = buildDefaultPath(params);

    await ensureDirectoryExists(defaultPath);

    const filePath = await save({
      defaultPath,
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpeg', 'jpg', 'webp', 'gif'],
        },
      ],
    });

    if (!filePath) return;

    const response = await tauriFetch(params.imgSrc);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    await writeFile(filePath, uint8Array);

    toast.show(msg.toastSaveImage, 'success');
  });
}
