/**
 * Vibrant default palette for file extensions, top-level directories, and contributors.
 */
export const DEFAULT_PALETTE: readonly string[] = [
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#fb7185', // rose
  '#22d3ee', // cyan
  '#a3e635', // lime
  '#fb923c', // orange
  '#60a5fa', // blue
  '#c084fc', // purple
  '#2dd4bf', // teal
];

/**
 * Okabe-Ito + Paul Tol colorblind-safe high-contrast palette (WCAG friendly).
 */
export const COLORBLIND_SAFE_PALETTE: readonly string[] = [
  '#56B4E9', // sky blue
  '#E69F00', // orange
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#88CCEE', // cyan
];

const KNOWN_EXT_INDICES: Record<string, number> = {
  ts: 0,
  tsx: 0,
  js: 3,
  jsx: 3,
  py: 2,
  rs: 8,
  go: 6,
  md: 1,
  json: 7,
  css: 4,
  scss: 4,
  html: 5,
  yml: 9,
  yaml: 9,
  sh: 11,
};

/**
 * Deterministic 32-bit FNV-1a string hash.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Returns a deterministic hex color (`#rrggbb`) for a key (extension, directory, or author).
 */
export function getPaletteColor(key: string, colorblindSafe = false): string {
  const palette = colorblindSafe ? COLORBLIND_SAFE_PALETTE : DEFAULT_PALETTE;
  if (!key) {
    return colorblindSafe ? '#94a3b8' : '#94a3b8';
  }
  const lower = key.toLowerCase();
  const known = KNOWN_EXT_INDICES[lower];
  const idx = known !== undefined ? known % palette.length : hashString(lower) % palette.length;
  return palette[idx]!;
}

/**
 * Converts a `#rrggbb` hex string to a 24-bit integer for PixiJS graphics calls.
 */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace(/^#/, ''), 16) || 0x38bdf8;
}
