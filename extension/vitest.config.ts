import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    testTimeout: 30000,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/app/**/*.ts', 'src/infra/**/*.ts', 'src/lib/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/lib/audio-capture.ts',
        'src/lib/capabilities.ts',
        'src/lib/keepalive.ts',
        'src/lib/job-state.ts',
        'src/lib/storage.ts',
        'src/lib/script-timeout.ts',
        'src/lib/local-stt.ts',
        'src/lib/offscreen-doc.*.ts',
        'src/lib/offscreen-message.ts',
        'src/lib/rutube-captions-via-tab.ts',
        'src/lib/runtime-messaging.*.ts',
        'src/lib/tab-capture.*.ts',
        'src/lib/tab-messaging.ts',
        'src/lib/translate-proxy.ts',
        'src/lib/types.ts',
        'src/lib/find-video-tab.ts',
        'src/lib/server-captions.ts',
        'src/lib/vk-captions.ts',
        'src/infra/stt/**',
      ],
    },
  },
});
