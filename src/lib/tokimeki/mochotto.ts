export interface MochottoLongPostRef {
  uri: string;
  cid: string;
  rkey: string;
}

export interface MochottoArticleResponse {
  article: {
    uri: string;
    cid: string;
    author: {
      did: string;
      handle: string;
      [key: string]: any;
    };
    title?: string;
    publishedAt?: string;
    contentJSON: {
      type: string;
      content: any[];
    };
    [key: string]: any;
  };
}

export interface MochottoProcessedText {
  text: string;
  facets: any[];
  mochottoRef: MochottoLongPostRef | null;
}

/**
 * Expands a mochotto long post by fetching its article and rendering its JSON content.
 */
export async function expandMochotto(href: string, record: any, authorDid: string): Promise<string> {
  if (!href.startsWith('https://mochott.site/')) return '';
  
  const ref = extractMochottoRef(record, authorDid);
  if (!ref || !ref.uri.endsWith(`/${ref.rkey}`)) return '';

  const data = await fetchMochottoArticle(ref.uri);
  if (!data?.article) return '';

  const embedUri = record?.embed?.external?.uri;
  const contentHtml = renderMochottoContentJson(data.article.contentJSON, embedUri);

  // Check if edited after post creation (CID comparison)
  const isEdited = ref.cid && data.article.cid !== ref.cid;
  const editedNotice = isEdited
    ? `<div class="mochotto-notice text-muted small">Edited</div>`
    : '';

  return `${editedNotice}${contentHtml}`;
}

/**
 * Validates and extracts mochotto longPost reference from post record.
 */
function extractMochottoRef(record: any, authorDid: string): MochottoLongPostRef | null {
  const ref = record?.['site.mochott.longPost'];
  if (!ref || typeof ref.uri !== 'string' || typeof ref.cid !== 'string') {
    return null;
  }

  const match = ref.uri.match(/^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/site\.mochott\.article\/([a-zA-Z0-9._~:-]{1,512})$/);
  if (!match || match[1] !== authorDid) {
    return null;
  }

  return {
    uri: ref.uri,
    cid: ref.cid,
    rkey: match[2]
  };
}

/**
 * Fetches the full article from mochott.site (No authentication required).
 */
export async function fetchMochottoArticle(uri: string): Promise<MochottoArticleResponse | null> {
  try {
    const encodedUri = encodeURIComponent(uri);
    const endpoint = `https://mochott.site/xrpc/site.mochott.article.getArticle?uri=${encodedUri}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`Failed to fetch mochotto article: HTTP ${res.status}`);
      return null;
    }

    const data: MochottoArticleResponse = await res.json();
    if (!data?.article || data.article.uri !== uri) {
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching mochotto article:', err);
    return null;
  }
}

/**
 * Safely renders TipTap / ProseMirror contentJSON into HTML.
 */
export function renderMochottoContentJson(contentJson: { type: string; content?: any[] }, embedUri?: string): string {
  if (!contentJson || !Array.isArray(contentJson.content)) return '';

  let html = '';
  for (const node of contentJson.content) {
    html += renderNode(node, embedUri);
  }
  return html ? `<div class="mochotto-div">${html}</div>` : '';
}

function renderNode(node: any, embedUri?: string): string {
  if (!node) return '';

  switch (node.type) {
    case 'paragraph': {
      const inner = Array.isArray(node.content) ? node.content.map((n) => renderNode(n, embedUri)).join('') : '';
      return `<p class="mochotto-p">${inner || '<br>'}</p>`;
    }
    case 'text': {
      let text = escapeHtml(node.text || '');
      if (Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          if (mark.type === 'link' && mark.attrs?.href) {
            const href = mark.attrs.href;
            if (href.startsWith('http://') || href.startsWith('https://')) {
              const safeHref = escapeHtml(href);
              text = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="post-link">${text}</a>`;
            }
          }
        }
      }
      return text;
    }
    case 'hardBreak':
      return '<br>';
    // case 'image': {
    //   const src = node.attrs?.src || '';
    //   if (!src.startsWith('/api/image/')) return '';
    //   const alt = escapeHtml(node.attrs?.alt || '');
    //   const width = node.attrs?.width ? `width="${Number(node.attrs.width)}" ` : '';
    //   const height = node.attrs?.height ? `height="${Number(node.attrs.height)}" ` : '';
    //   return `<div class="mochotto-img-container"><img src="${escapeHtml(src)}" alt="${alt}" ${width}${height} loading="lazy" class="mochotto-image" /></div>`;
    // }
    case 'linkCard': {
      const url = node.attrs?.url || '';
      if (!url.startsWith('http://') && !url.startsWith('https://')) return '';
      if (embedUri && url === embedUri) return '';
      const title = escapeHtml(node.attrs?.title || url);
      const description = escapeHtml(node.attrs?.description || '');
      return `
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="mochotto-link-card">
          <div class="mochotto-link-info">
            <div class="mochotto-link-title">${title}</div>
            ${description ? `<div class="mochotto-link-desc">${description}</div>` : ''}
          </div>
        </a>
      `;
    }
    case 'embed': {
      const service = node.attrs?.service;
      const src = node.attrs?.src || '';
      if (service === 'bluesky' && src.startsWith('https://bsky.app/')) {
        return `<div class="mochotto-embed-box"><a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" class="post-link">[Bluesky: ${escapeHtml(src)}]</a></div>`;
      }
      return '';
    }
    default:
      return '';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
