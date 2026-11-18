import { describe, expect, it } from 'vitest';
import { parseMailmap, resolveAuthorWithMailmap } from '../src/index.js';

describe('parseMailmap & resolveAuthorWithMailmap', () => {
  it('merges aliases across standard .mailmap syntaxes', () => {
    const content = [
      '# Comment line',
      'Alice Canonical <alice@corp.com> <alice.old@gmail.com>',
      'Alice Canonical <alice@corp.com> Ali <ali@dev.local>',
      'Bob Proper <bob@example.com>',
    ].join('\n');

    const map = parseMailmap(content);

    expect(resolveAuthorWithMailmap('Old Alice', 'alice.old@gmail.com', map)).toEqual({
      name: 'Alice Canonical',
      email: 'alice@corp.com',
    });

    expect(resolveAuthorWithMailmap('Ali', 'ali@dev.local', map)).toEqual({
      name: 'Alice Canonical',
      email: 'alice@corp.com',
    });

    expect(resolveAuthorWithMailmap('bobby', 'bob@example.com', map)).toEqual({
      name: 'Bob Proper',
      email: 'bob@example.com',
    });

    expect(resolveAuthorWithMailmap('Charlie', 'charlie@example.com', map)).toEqual({
      name: 'Charlie',
      email: 'charlie@example.com',
    });
  });
});
