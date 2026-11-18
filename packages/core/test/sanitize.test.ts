import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  getFileExtension,
  getParentDir,
  getTopLevelDir,
  normalizeRepoPath,
  stripControlChars,
} from '../src/index.js';

describe('sanitize utilities', () => {
  it('normalizes Windows separators, leading slashes, and duplicate slashes', () => {
    expect(normalizeRepoPath('./src\\utils//index.ts')).toBe('src/utils/index.ts');
    expect(normalizeRepoPath('/README.md')).toBe('README.md');
  });

  it('rejects path traversal segments', () => {
    expect(() => normalizeRepoPath('../etc/passwd')).toThrow();
    expect(() => normalizeRepoPath('src/../../secret')).toThrow();
  });

  it('extracts parent dir, top-level dir, and lowercase extension', () => {
    expect(getParentDir('packages/core/src/index.ts')).toBe('packages/core/src');
    expect(getParentDir('README.md')).toBe('');
    expect(getTopLevelDir('packages/core/src/index.ts')).toBe('packages');
    expect(getTopLevelDir('README.md')).toBe('');
    expect(getFileExtension('src/App.TSX')).toBe('tsx');
    expect(getFileExtension('Makefile')).toBe('');
    expect(getFileExtension('.gitignore')).toBe('');
  });

  it('escapes HTML special characters and strips control chars from untrusted repo text', () => {
    expect(escapeHtml('<script>alert("x") & \'y\'</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;',
    );
    expect(stripControlChars('hello\x00world\x1b[31m\tred\nline')).toBe('helloworld[31m\tred line');
  });
});
