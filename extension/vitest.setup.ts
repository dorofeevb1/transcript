import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const ruMessages = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '_locales/ru/messages.json'),
    'utf8',
  ),
);

vi.stubGlobal('chrome', {
  scripting: {
    executeScript: async ({
      func,
      args,
    }: {
      func: (...a: unknown[]) => Promise<unknown>;
      args: unknown[];
    }) => [{ result: await func(...args) }],
  },
  tabs: {
    get: async () => ({ url: 'https://www.youtube.com/watch?v=test' }),
  },
  i18n: {
    getUILanguage: () => 'ru',
    getMessage: (key: string, substitutions?: string | string[]) => {
      const entry = ruMessages[key];
      if (!entry) return key;
      let text: string = entry.message;
      const subs = substitutions == null ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
      subs.forEach((s, i) => {
        text = text.replace(new RegExp(`\\$${i + 1}`, 'g'), s);
      });
      if (entry.placeholders) {
        for (const [name, spec] of Object.entries(entry.placeholders)) {
          const m = (spec as { content: string }).content.match(/^\$(\d+)$/);
          const value = m ? (subs[Number(m[1]) - 1] ?? '') : '';
          text = text.replace(new RegExp(`\\$${name}\\$`, 'gi'), value);
        }
      }
      return text;
    },
  },
  runtime: {
    getURL: (p: string) => `chrome-extension://test/${p}`,
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    },
  },
});

vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('_locales/ru/messages.json')) {
    return new Response(JSON.stringify(ruMessages), { status: 200 });
  }
  throw new Error(`unexpected fetch: ${url}`);
});
