import { describe, it, expect } from 'vitest';
import { formatPostHtml, postMentionSpan } from '../../src/lib/richtext';

describe('richtext', () => {
  describe('formatPostHtml', () => {
    it('should return an empty string when rawPostText is empty', () => {
      expect(formatPostHtml('')).toBe('');
    });

    it('should escape HTML characters and auto-link URLs when facets are absent', () => {
      const text = 'Hello <script>alert(1);</script> check https://example.com';
      const result = formatPostHtml(text);
      
      // HTML tags should be escaped
      expect(result).toContain('&lt;script&gt;');
      // URLs should be auto-linked
      expect(result).toContain(
        '<a href="https://example.com" title="https://example.com" target="_blank" rel="noopener noreferrer" class="post-link">https://example.com</a>'
      );
    });

    it('should correctly format text with link facets', () => {
      const text = 'Visit our website now!';
      // "website" starts at byte index 9, ends at 16
      const facets = [
        {
          index: { byteStart: 10, byteEnd: 17 },
          features: [
            {
              $type: 'app.bsky.richtext.facet#link',
              uri: 'https://example.org',
            },
          ],
        },
      ];

      const result = formatPostHtml(text, facets);
      expect(result).toBe(
        'Visit our <a href="https://example.org" title="https://example.org" target="_blank" rel="noopener noreferrer" class="post-link clickable">website</a> now!'
      );
    });

    it('should correctly format text with mention facets', () => {
      const text = 'Hello @alice.test';
      // "@alice.test" starts at byte index 6, ends at 17
      const facets = [
        {
          index: { byteStart: 6, byteEnd: 17 },
          features: [
            {
              $type: 'app.bsky.richtext.facet#mention',
              did: 'did:plc:alice123',
            },
          ],
        },
      ];

      const result = formatPostHtml(text, facets);
      expect(result).toBe(
        'Hello <span class="post-mention clickable" data-did="did:plc:alice123">@alice.test</span>'
      );
    });
  });

  describe('postMentionSpan', () => {
    it('should generate correct HTML span with proper classes and data attributes', () => {
      const did = 'did:plc:abcdef123456';
      const handle = 'alice.bsky.social';

      const result = postMentionSpan(did, handle);

      expect(result).toBe(
        '<span class="post-mention clickable" data-did="did:plc:abcdef123456">alice.bsky.social</span>'
      );
    });

    it('should escape special HTML characters in DID and handle', () => {
      const maliciousDid = 'did:plc:test"&<>';
      const maliciousHandle = '<script>alert("xss")</script>';

      const result = postMentionSpan(maliciousDid, maliciousHandle);

      // escapeHtml replaces & with &amp;, < with &lt;, > with &gt;, and quotes are handled
      expect(result).toContain('data-did="did:plc:test&quot;&amp;&lt;&gt;"');
      expect(result).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });
});
