import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import type { PreRenderedChunk } from 'rollup';
import { defineConfig } from 'vite';

import { manifest } from './src/manifest';

const outDir = process.env.BUILD_OUT_DIR || 'dist';

function getStableEntryFileName(chunk: PreRenderedChunk): string {
  const facadeModuleId = chunk.facadeModuleId?.replace(/\\/g, '/') ?? '';

  if (facadeModuleId.endsWith('/src/background/index.ts')) {
    return 'assets/background.js';
  }

  if (facadeModuleId.endsWith('/src/content/index.ts')) {
    return 'assets/content.js';
  }

  if (facadeModuleId.endsWith('/src/popup/index.tsx')) {
    return 'assets/popup.js';
  }

  if (facadeModuleId.endsWith('/src/options/index.tsx')) {
    return 'assets/options.js';
  }

  if (facadeModuleId.endsWith('/src/pdf/index.tsx')) {
    return 'assets/pdf.js';
  }

  if (facadeModuleId.endsWith('/src/pdf-viewer/index.tsx')) {
    return 'assets/pdf-viewer.js';
  }

  if (facadeModuleId.endsWith('/src/offscreen/index.ts')) {
    return 'assets/offscreen.js';
  }

  if (facadeModuleId.endsWith('/src/offscreen/audio-capture.ts')) {
    return 'assets/audio-capture.js';
  }

  return `assets/${chunk.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.js`;
}

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        pdf: resolve(__dirname, 'src/pdf/index.html'),
        pdfViewer: resolve(__dirname, 'src/pdf-viewer/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
      output: {
        entryFileNames: getStableEntryFileName,
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
