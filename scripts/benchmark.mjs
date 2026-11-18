import { performance } from 'node:perf_hooks';
import {
  ReplayEngine,
  aggregateHistory,
  buildChapters,
  collapseRepoState,
  detectHighlights,
  resolveLargeRepoPolicy,
} from '../packages/core/dist/index.js';
import { StableTreeLayout } from '../packages/layout/dist/index.js';
import { TimelineEngine } from '../packages/timeline/dist/index.js';

function generateSyntheticHistory(commitCount) {
  const dirs = ['src/core', 'src/ui', 'src/api', 'packages/a', 'packages/b', 'docs', 'tests'];
  const exts = ['ts', 'tsx', 'css', 'json', 'md'];
  const authors = {
    'alice@bench.dev': { name: 'Alice', isBot: false },
    'bob@bench.dev': { name: 'Bob', isBot: false },
    'carol@bench.dev': { name: 'Carol', isBot: false },
    'bot@bench.dev': { name: 'dependabot[bot]', isBot: true },
  };
  const authorKeys = Object.keys(authors);
  const events = [];
  const active = [];
  const base = 1640995200;

  for (let i = 0; i < commitCount; i++) {
    const changes = [];
    if (active.length < 1500 && i % 2 === 0) {
      const p = `${dirs[i % dirs.length]}/mod_${i}.${exts[i % exts.length]}`;
      active.push(p);
      changes.push({ path: p, type: 'A', add: 45, del: 0 });
    } else if (active.length > 0) {
      const p = active[i % active.length];
      changes.push({ path: p, type: 'M', add: 12, del: 4 });
    }
    events.push({
      hash: i.toString(16).padStart(8, '0'),
      parents: i === 0 ? [] : [(i - 1).toString(16).padStart(8, '0')],
      t: base + i * 3600 * 4,
      author: authorKeys[i % authorKeys.length],
      message: `feat: synthetic commit ${i}`,
      isBot: i % 15 === 0,
      changes,
    });
  }

  return {
    schemaVersion: 1,
    repo: { name: `synthetic-${commitCount}`, head: events[events.length - 1].hash },
    authors,
    tags: [
      { name: 'v0.5.0', hash: events[Math.floor(commitCount / 2)].hash, t: events[Math.floor(commitCount / 2)].t },
      { name: 'v1.0.0', hash: events[commitCount - 1].hash, t: events[commitCount - 1].t },
    ],
    events,
  };
}

function runBench(commitCount) {
  const history = generateSyntheticHistory(commitCount);

  const t0 = performance.now();
  const policy = resolveLargeRepoPolicy(history.events.length);
  const effective = aggregateHistory(history, { granularity: policy.granularity });
  const tAgg = performance.now() - t0;

  const t1 = performance.now();
  const chapters = buildChapters(effective);
  const highlights = detectHighlights(effective);
  const tHl = performance.now() - t1;

  const t2 = performance.now();
  const replay = new ReplayEngine(effective);
  const tReplay = performance.now() - t2;

  const t3 = performance.now();
  const timeline = new TimelineEngine(effective.events, { chapters, highlights });
  const layout = new StableTreeLayout();
  let maxNodesSeen = 0;
  for (let s = 0; s < 60; s++) {
    const snap = timeline.sampleAtTime((s / 59) * timeline.getSnapshot().totalDurationSec);
    const rawState = replay.getStateAt(snap.eventIndex);
    const viewState = collapseRepoState(rawState, {
      maxDepth: policy.maxDepth,
      maxNodes: policy.maxNodes,
    });
    const frame = layout.compute(viewState);
    if (frame.nodes.length > maxNodesSeen) maxNodesSeen = frame.nodes.length;
  }
  const t60Frames = performance.now() - t3;

  console.log(
    JSON.stringify({
      commits: commitCount,
      policy: policy.granularity,
      buckets: effective.events.length,
      aggMs: Number(tAgg.toFixed(1)),
      highlightsMs: Number(tHl.toFixed(1)),
      replayIndexMs: Number(tReplay.toFixed(1)),
      sixtyFramesMs: Number(t60Frames.toFixed(1)),
      avgFrameMs: Number((t60Frames / 60).toFixed(2)),
      maxNodesRendered: maxNodesSeen,
    }),
  );
}

runBench(5000);
runBench(10000);
