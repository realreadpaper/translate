import { describe, expect, it } from 'vitest';

import {
  createPdfTranslationCache,
  createPdfTranslationCacheKey,
} from '../../src/pdf/pdf-translation-cache';

describe('pdf translation cache', () => {
  it('creates stable block-level keys that vary by pdf, text, provider, and target language', async () => {
    const base = await createPdfTranslationCacheKey({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      pageNumber: 1,
      blockText: 'Abstract',
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
    });
    const same = await createPdfTranslationCacheKey({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      pageNumber: 1,
      blockText: 'Abstract',
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
    });
    const differentText = await createPdfTranslationCacheKey({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      pageNumber: 1,
      blockText: 'Introduction',
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
    });

    expect(base).toBe(same);
    expect(base).not.toBe(differentText);
    expect(base).toMatch(/^pdf-translation-cache:v1:/);
  });

  it('reads and writes cached translations through the provided storage adapter', async () => {
    const store = new Map<string, unknown>();
    const cache = createPdfTranslationCache({
      get: async (keys) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (store.has(key)) {
            result[key] = store.get(key);
          }
        }
        return result;
      },
      set: async (values) => {
        for (const [key, value] of Object.entries(values)) {
          store.set(key, value);
        }
      },
    });

    await cache.setTranslations([
      {
        keyInput: {
          sourceUrl: 'https://example.com/report.pdf',
          pageNumber: 2,
          blockText: 'Hello',
          providerId: 'deepseek',
          sourceLanguage: 'auto',
          targetLanguage: 'zh-CN',
        },
        translatedText: '你好',
      },
    ]);

    await expect(
      cache.getTranslations([
        {
          id: 'block-1',
          keyInput: {
            sourceUrl: 'https://example.com/report.pdf',
            pageNumber: 2,
            blockText: 'Hello',
            providerId: 'deepseek',
            sourceLanguage: 'auto',
            targetLanguage: 'zh-CN',
          },
        },
      ]),
    ).resolves.toEqual(new Map([['block-1', '你好']]));
  });
});
