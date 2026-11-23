/**
 * Helper function to escape special HTML characters.
 */
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Generates a safe HTML string based on Bluesky post text and facets (rich text information).
 */
export function formatPostHtml(rawPostText: string, facets?: any[]): string {
  if (!rawPostText) return "";

  // Fallback to standard URL auto-linking if no facets are present
  if (!Array.isArray(facets) || facets.length === 0) {
    const escaped = escapeHtml(rawPostText);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlRegex, (url) =>
      `<a href="${url}" title="${url}" target="_blank" rel="noopener noreferrer" class="post-link">${url}</a>`
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const textBytes = encoder.encode(rawPostText);
  // Sort facets by byte position order (with fallback if index is missing)
  const sortedFacets = [...facets].sort((a, b) => (a.index?.byteStart ?? 0) - (b.index?.byteStart ?? 0));

  let resultHtml = "";
  let lastByteIndex = 0;

  for (const facet of sortedFacets) {
    const byteStart = facet.index?.byteStart;
    const byteEnd = facet.index?.byteEnd;
    if (typeof byteStart !== "number" || typeof byteEnd !== "number") continue;

    // Safety check for overlapping ranges
    if (byteStart < lastByteIndex) continue;

    if (byteStart > lastByteIndex) {
      resultHtml += escapeHtml(decoder.decode(textBytes.slice(lastByteIndex, byteStart)));
    }

    const targetText = escapeHtml(decoder.decode(textBytes.slice(byteStart, byteEnd)));
    const features = facet.features || [];

    const linkFeature = features.find((f: any) => f.$type === "app.bsky.richtext.facet#link");
    const mentionFeature = features.find((f: any) => f.$type === "app.bsky.richtext.facet#mention");
    const tagFeature = features.find((f: any) => f.$type === "app.bsky.richtext.facet#tag");

    if (linkFeature && linkFeature.uri) {
      const uri = escapeHtml(linkFeature.uri);
      resultHtml += `<a href="${uri}" title="${uri}" target="_blank" rel="noopener noreferrer" class="post-link clickable">${targetText}</a>`;
    } else if (mentionFeature && mentionFeature.did) {
      // HTML output for mentions (CSS classes or DID can be attached as needed)
      resultHtml += postMentionSpan(mentionFeature.did, targetText);
    } else if(tagFeature) {
      resultHtml += `<span class="post-tag clickable">${escapeHtml(targetText)}</span>`;
    } else {
      resultHtml += targetText;
    }

    lastByteIndex = byteEnd;
  }

  if (lastByteIndex < textBytes.length) {
    resultHtml += escapeHtml(decoder.decode(textBytes.slice(lastByteIndex)));
  }

  return resultHtml;
}

export function postMentionSpan(did: string, handle: string): string {
  return `<span class="post-mention clickable" data-did="${escapeHtml(did)}">${escapeHtml(handle)}</span>`;
}

