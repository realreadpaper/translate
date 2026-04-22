import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/content/**/*.test.ts', 'jsdom']],
    include: ['tests/**/*.test.ts'],
  },
});
