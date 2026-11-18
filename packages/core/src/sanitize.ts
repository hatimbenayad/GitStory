const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Normalizes a repository-relative path to POSIX format and rejects traversal segments.
 */
export function normalizeRepoPath(raw: string): string {
  const cleaned = raw.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (cleaned.length === 0) {
    throw new Error('Repository path must not be empty');
  }
  const segments = cleaned.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`Unsafe path traversal segment in repository path: "${raw}"`);
    }
  }
  return segments.filter((seg) => seg !== '.').join('/');
}

/**
 * Returns the parent POSIX directory path, or `''` for root-level files.
 */
export function getParentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/**
 * Returns the top-level directory segment, or `''` for root-level files.
 */
export function getTopLevelDir(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/**
 * Returns the lowercase file extension without leading dot, or `''` if none (including dotfiles).
 */
export function getFileExtension(path: string): string {
  const slashIdx = path.lastIndexOf('/');
  const filename = slashIdx === -1 ? path : path.slice(slashIdx + 1);
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === filename.length - 1) {
    return '';
  }
  return filename.slice(dotIdx + 1).toLowerCase();
}

/**
 * Escapes HTML special characters for safe rendering of untrusted repository strings.
 */
export function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Removes unsafe ASCII control characters (turning CR/LF into spaces, keeping tabs).
 */
export function stripControlChars(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) {
      out += ' ';
    } else if (code === 0x09 || (code >= 0x20 && code !== 0x7f)) {
      out += raw[i];
    }
  }
  return out;
}
