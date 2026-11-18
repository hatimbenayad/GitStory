import { describe, expect, it } from 'vitest';
import { parseGitLogStream } from '../src/index.js';

async function* chunked(text: string, chunkSize: number): AsyncGenerator<Buffer> {
  const buf = Buffer.from(text, 'utf8');
  for (let i = 0; i < buf.length; i += chunkSize) {
    yield buf.subarray(i, i + chunkSize);
  }
}

describe('parseGitLogStream', () => {
  it('parses A/M/D/R/C, binary files, spaces/quotes/unicode across tiny chunk boundaries', async () => {
    const rawLog = [
      // Commit 1: Add normal + binary + unicode/quoted path
      `\x1eaaaa1111\x1f\x1fAlice\x1falice@example.com\x1f1700000000\x1finitial commit\x1e\x00`,
      `\n:000000 100644 0000000 1111111 A\x00src/hello world "1" café.ts\x00`,
      `:000000 100644 0000000 2222222 A\x00assets/logo.png\x00`,
      `12\t0\tsrc/hello world "1" café.ts\x00`,
      `-\t-\tassets/logo.png\x00`,
      // Commit 2: Rename + Modify + Delete by bot
      `\x1ebbbb2222\x1faaaa1111\x1fdependabot[bot]\x1fdependabot[bot]@users.noreply.github.com\x1f1700003600\x1fchore: rename and clean\x1e\x00`,
      `\n:100644 100644 1111111 3333333 R095\x00src/hello world "1" café.ts\x00src/renamed.ts\x00`,
      `:100644 000000 2222222 0000000 D\x00assets/logo.png\x00`,
      `3\t1\t\x00src/hello world "1" café.ts\x00src/renamed.ts\x00`,
      `-\t-\tassets/logo.png\x00`,
    ].join('');

    // Deliberately slice into tiny 7-byte chunks to prove streaming boundary resilience
    const { events, authors } = await parseGitLogStream(chunked(rawLog, 7));

    expect(events).toHaveLength(2);
    expect(events[0]!.hash).toBe('aaaa1111');
    expect(events[0]!.isBot).toBe(false);
    expect(events[0]!.changes).toEqual([
      { path: 'src/hello world "1" café.ts', type: 'A', add: 12, del: 0 },
      { path: 'assets/logo.png', type: 'A', add: 0, del: 0 },
    ]);

    expect(events[1]!.hash).toBe('bbbb2222');
    expect(events[1]!.isBot).toBe(true);
    expect(events[1]!.changes).toEqual([
      {
        path: 'src/renamed.ts',
        from: 'src/hello world "1" café.ts',
        type: 'R',
        add: 3,
        del: 1,
      },
      { path: 'assets/logo.png', type: 'D', add: 0, del: 0 },
    ]);

    expect(authors['alice@example.com']?.isBot).toBe(false);
    expect(authors['dependabot[bot]@users.noreply.github.com']?.isBot).toBe(true);
  });
});
