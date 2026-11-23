import { describe, it, expect } from 'vitest';
import { formatDateTime, isSafeUrl, sanitizeFileName } from '../../src/lib/stringutils';

describe('stringutils', () => {
  describe('formatDateTime', () => {
    it('should correctly format an ISO date-time string to "YYYY/MM/DD HH:mm:ss"', () => {
      const iso = '2026-10-25T12:34:56.000Z';
      const result = formatDateTime(iso);
      expect(result.full).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should return an empty string when an empty or falsy value is passed', () => {
      expect(formatDateTime('').full).toBe('');
    });
  });

  describe('isSafeUrl', () => {
    it('should return true for http or https URLs', () => {
      expect(isSafeUrl('https://example.com')).toBe(true);
      expect(isSafeUrl('http://example.com/path?query=1')).toBe(true);
    });

    it('should return false for non-http/https protocols (e.g., javascript:, file:)', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeUrl('file:///C:/Windows/System32')).toBe(false);
    });

    it('should return false for invalid URL strings without throwing exceptions', () => {
      expect(isSafeUrl('not-a-url')).toBe(false);
      expect(isSafeUrl('')).toBe(false);
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace characters invalid for file names', () => {
      const result = sanitizeFileName('file/name\\with*invalid?chars"<>|#.png');
      expect(result).not.toMatch(/[\\/:*?"<>|#]/);
    });

    it('should replace consecutive dots to prevent path traversal', () => {
      const result = sanitizeFileName('../../etc/passwd');
      expect(result).not.toContain('..');
    });

    it('should return the fallback value for empty or invalid strings', () => {
      expect(sanitizeFileName('')).toBe('_');
      expect(sanitizeFileName('', 'default')).toBe('default');
    });

    it('should trim surrounding whitespaces and leading dots', () => {
      const result = sanitizeFileName('  .hidden-file  ');
      expect(result).toBe('hidden-file');
    });
  });
});
