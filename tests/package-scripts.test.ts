import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('package scripts', () => {
  it('creates release packages from a fresh zip file', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['package:release']).toContain('rm -f "$ZIP"');
  });
});
