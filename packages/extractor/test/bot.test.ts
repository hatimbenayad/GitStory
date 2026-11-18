import { describe, expect, it } from 'vitest';
import { detectBot } from '../src/index.js';

describe('detectBot', () => {
  it('flags well-known bots by name or email', () => {
    expect(detectBot('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com')).toBe(true);
    expect(detectBot('renovate[bot]', 'renovate@whitesourcesoftware.com')).toBe(true);
    expect(detectBot('github-actions[bot]', 'action@github.com')).toBe(true);
    expect(detectBot('Renovate Bot', 'bot@renovateapp.com')).toBe(true);
    expect(detectBot('snyk-bot', 'snyk-bot@snyk.io')).toBe(true);
  });

  it('does not flag regular human contributors', () => {
    expect(detectBot('Alice Developer', 'alice@example.com')).toBe(false);
    expect(detectBot('Robert Botwin', 'robert@company.org')).toBe(false);
  });

  it('supports custom extra bot patterns', () => {
    expect(detectBot('ci-release-helper', 'ci@corp.internal', [/ci-release/i])).toBe(true);
  });
});
