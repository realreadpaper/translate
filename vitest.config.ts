import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/content/**/*.test.ts', 'jsdom'],
      ['tests/popup/**/*.test.tsx', 'jsdom'],
      ['tests/options/**/*.test.tsx', 'jsdom'],
    ],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
