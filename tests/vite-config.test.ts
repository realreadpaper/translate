import { describe, expect, it } from 'vitest';
import type { OutputOptions } from 'rollup';

import viteConfig from '../vite.config';

describe('vite config', () => {
  it('uses stable extension script filenames so reloaded unpacked extensions do not lose chunks', () => {
    const config = typeof viteConfig === 'function' ? viteConfig({ mode: 'production' }) : viteConfig;
    const output = config.build?.rollupOptions?.output as OutputOptions;

    expect(output.entryFileNames).toEqual(expect.any(Function));
    expect(output.chunkFileNames).toBe('assets/[name].js');
  });
});
