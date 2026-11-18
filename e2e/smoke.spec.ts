import { expect, test } from '@playwright/test';

const FIXTURE_HISTORY = {
  schemaVersion: 1,
  repo: { name: 'e2e-fixture-repo', head: 'c000003', defaultBranch: 'main' },
  authors: {
    'alice@e2e.dev': { name: 'Alice', email: 'alice@e2e.dev', isBot: false },
    'bob@e2e.dev': { name: 'Bob', email: 'bob@e2e.dev', isBot: false },
  },
  tags: [{ name: 'v1.0.0', hash: 'c000003', t: 1700010000 }],
  events: [
    {
      hash: 'c000001',
      parents: [],
      t: 1700000000,
      author: 'alice@e2e.dev',
      message: 'feat: bootstrap e2e fixture',
      isBot: false,
      changes: [
        { path: 'README.md', type: 'A', add: 20, del: 0 },
        { path: 'src/index.ts', type: 'A', add: 50, del: 0 },
      ],
    },
    {
      hash: 'c000002',
      parents: ['c000001'],
      t: 1700005000,
      author: 'bob@e2e.dev',
      message: 'feat(ui): add dashboard module',
      isBot: false,
      changes: [{ path: 'src/ui/dashboard.ts', type: 'A', add: 95, del: 0 }],
    },
    {
      hash: 'c000003',
      parents: ['c000002'],
      t: 1700010000,
      author: 'alice@e2e.dev',
      message: 'release: v1.0.0',
      isBot: false,
      changes: [{ path: 'src/index.ts', type: 'M', add: 15, del: 3 }],
    },
  ],
};

test('loads fixture history.json, plays, scrubs, switches views, and exports a GIF clip', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  expect(pageErrors).toEqual([]);

  // Upload fixture history.json via hidden file input
  await page.getByTestId('history-file-input').setInputFiles({
    name: 'fixture-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(FIXTURE_HISTORY), 'utf8'),
  });

  // Replay canvas and HUD load
  await expect(page.getByTestId('repo-name')).toHaveText('e2e-fixture-repo');
  await expect(page.getByTestId('replay-canvas-host')).toBeVisible();
  await expect(page.getByTestId('hud-message')).toContainText('bootstrap e2e fixture');

  // Play & Pause
  await page.getByTestId('play-pause-btn').click();
  await page.waitForTimeout(300);
  await page.getByTestId('play-pause-btn').click();

  // Scrub to end -> verify HUD updates to v1.0.0 chapter & 3 files
  await page.getByTestId('timeline-scrubber').fill('1000');
  await page.getByTestId('timeline-scrubber').dispatchEvent('input');
  await expect(page.getByTestId('stat-files')).toHaveText('3');

  // Switch across all views: Treemap, Contributors, Architecture, back to Replay
  await page.getByTestId('view-tab-treemap').click();
  await expect(page.getByTestId('treemap-view')).toBeVisible();

  await page.getByTestId('view-tab-contributors').click();
  await expect(page.getByTestId('contributors-view')).toBeVisible();

  await page.getByTestId('view-tab-arch').click();
  await expect(page.getByTestId('arch-diff-view')).toBeVisible();

  await page.getByTestId('view-tab-replay').click();
  await expect(page.getByTestId('replay-canvas-host')).toBeVisible();

  // Export a short GIF clip
  await page.getByTestId('open-export-btn').click();
  await expect(page.getByTestId('export-modal')).toBeVisible();
  await page.getByTestId('export-format-select').selectOption('gif');
  const durationInput = page.locator('input[type="number"]').first();
  await durationInput.fill('1');
  await page.getByTestId('start-export-btn').click();
  await expect(page.getByTestId('export-status')).toContainText('Exported', { timeout: 20_000 });
});
