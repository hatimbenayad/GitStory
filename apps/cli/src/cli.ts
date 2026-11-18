#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractHistory, readRepoFilesAtRef } from '@gitstory/extractor';
import { buildArchGraph, diffArchGraphs } from '@gitstory/layout';
import { startLocalServer } from './serve.js';

const HELP_TEXT = `GitStory CLI — Turn any Git repository into a documentary.

Usage:
  gitstory <repo-path> [options]
  gitstory extract <repo-path> [-o history.json] [--full-history]
  gitstory serve <repo-path> [--port 4173] [--full-history]
  gitstory arch <repo-path> <refA> <refB> [-o arch-diff.json]

Options:
  -o, --output <file>   Output path (default: history.json or arch-diff.json)
  --full-history        Include all branch commits (default: first-parent only)
  --max-commits <n>     Limit extracted commits to the most recent N
  --serve               Start local web server preloaded with this repository
  --port <n>            Port for --serve (default: 4173)
  -h, --help            Show this help message
`;

export async function runCli(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      'full-history': { type: 'boolean', default: false },
      'max-commits': { type: 'string' },
      serve: { type: 'boolean', default: false },
      port: { type: 'string', default: '4173' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP_TEXT);
    return values.help ? 0 : 1;
  }

  let command = 'extract';
  let repoArg = positionals[0]!;
  if (repoArg === 'extract' || repoArg === 'serve' || repoArg === 'arch') {
    command = repoArg;
    repoArg = positionals[1] ?? '.';
  }
  if (values.serve) {
    command = 'serve';
  }

  if (command === 'arch') {
    const refA = positionals[2];
    const refB = positionals[3];
    if (!refA || !refB) {
      process.stderr.write('Usage: gitstory arch <repo-path> <refA> <refB> [-o arch-diff.json]\n');
      return 1;
    }
    try {
      const [filesA, filesB] = await Promise.all([
        readRepoFilesAtRef(repoArg, refA),
        readRepoFilesAtRef(repoArg, refB),
      ]);
      const diff = diffArchGraphs(buildArchGraph(refA, filesA), buildArchGraph(refB, filesB));
      const outPath = resolve(values.output ?? 'arch-diff.json');
      writeFileSync(outPath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
      process.stdout.write(
        `Wrote ${outPath} (+${diff.summary.addedNodes} -${diff.summary.removedNodes} ~${diff.summary.changedNodes} modules)\n`,
      );
      return 0;
    } catch (err) {
      process.stderr.write(`GitStory arch error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  const firstParent = !values['full-history'];
  const maxCommits =
    values['max-commits'] !== undefined ? Number.parseInt(values['max-commits'], 10) : undefined;

  if (maxCommits !== undefined && (!Number.isFinite(maxCommits) || maxCommits <= 0)) {
    process.stderr.write('Error: --max-commits must be a positive integer.\n');
    return 1;
  }

  try {
    const history = await extractHistory({
      repoPath: repoArg,
      firstParent,
      ...(maxCommits !== undefined ? { maxCommits } : {}),
    });

    if (command === 'serve') {
      const port = Number.parseInt(values.port ?? '4173', 10);
      const { url } = await startLocalServer({
        history,
        port: Number.isFinite(port) && port >= 0 ? port : 4173,
      });
      process.stdout.write(
        `GitStory serving "${history.repo.name}" (${history.events.length} commits, ${history.tags.length} tags)\n`,
      );
      process.stdout.write(`Open in browser: ${url}\nPress Ctrl+C to stop.\n`);
      return 0;
    }

    const outPath = resolve(values.output ?? 'history.json');
    writeFileSync(outPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `Wrote ${outPath} (${history.events.length} commits, ${Object.keys(history.authors).length} authors, ${history.tags.length} tags)\n`,
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`GitStory error: ${msg}\n`);
    return 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  runCli(process.argv.slice(2)).then((code) => {
    if (code !== 0) {
      process.exitCode = code;
    }
  });
}
