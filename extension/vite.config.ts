import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

const root = path.dirname(fileURLToPath(import.meta.url));
const firefox = process.env.FIREFOX_BUILD === '1';

const sttAlias = firefox
  ? {
      '@stt/tab-capture': path.join(root, 'src/infra/stt/tab-capture.firefox.ts'),
      '@stt/recording': path.join(root, 'src/infra/stt/recording.firefox.ts'),
      '@stt/offscreen-doc': path.join(root, 'src/infra/offscreen/offscreen-doc.firefox.ts'),
      '@stt/popup-fetch': path.join(root, 'src/popup/popup-fetch.firefox.ts'),
    }
  : {
      '@stt/tab-capture': path.join(root, 'src/infra/stt/tab-capture.chromium.ts'),
      '@stt/recording': path.join(root, 'src/infra/stt/recording.chromium.ts'),
      '@stt/offscreen-doc': path.join(root, 'src/infra/offscreen/offscreen-doc.chromium.ts'),
      '@stt/popup-fetch': path.join(root, 'src/popup/popup-fetch.chromium.ts'),
    };

export default defineConfig({
  define: {
    __FIREFOX_BUILD__: JSON.stringify(firefox),
  },
  resolve: {
    alias: sttAlias,
  },
  plugins: [crx({ manifest })],
  build: {
    outDir: firefox ? 'dist-firefox' : 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: firefox
        ? undefined
        : {
            offscreen: 'src/offscreen/offscreen.html',
          },
    },
  },
});
