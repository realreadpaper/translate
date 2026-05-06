import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

import { manifest } from './src/manifest';

const outDir = process.env.BUILD_OUT_DIR || 'dist';

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
    },
  },
});
