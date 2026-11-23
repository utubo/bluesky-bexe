export interface FormatedDateTime {
  full: string;
  short: string;
}

/**
 * Formats an ISO date-time string into "YYYY/MM/DD HH:mm:ss" format.
 */
export function formatDateTime(isoString: string): FormatedDateTime {
  const formated =  { full: '', short: '' };
  if (!isoString) return formated;
  const date = new Date(isoString);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  formated.full = `${date.getFullYear()}/${mm}/${dd} ${hh}:${min}:${ss}`;
  if (Date.now() - date.getTime() < 180 * 24 * 60 * 60 * 1000) {
    formated.short = `${mm}/${dd} ${hh}:${min}`;
  } else {
    formated.short = formated.full;
  }
  return formated
}

/**
 * Determines whether the specified URL uses a safe protocol (http / https).
 */
export const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Sanitizes or replaces invalid characters, consecutive dots, and unsafe patterns in filenames or paths.
 */
export const sanitizeFileName = (rawStr: string, fallback = '_'): string => {
  if (!rawStr) return fallback;

  const sanitized = rawStr
    // 1. Replace characters unsuitable or dangerous for filenames
    .replace(/[\\/:*?"<>|#]/g, '_')
    // 2. Prevent path traversal by removing consecutive dots (e.g., '..')
    .replace(/\.{2,}/g, '_')
    // 3. Remove control characters and line breaks
    .replace(/[\r\n]+/g, ' ')
    // 4. Trim leading/trailing whitespace and dots
    .trim()
    .replace(/^\.+/, '');

  return sanitized || fallback;
};
