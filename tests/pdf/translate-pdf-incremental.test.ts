import { describe, expect, it, vi } from 'vitest';

import type { PdfTextPage } from '../../src/pdf/pdf-text';
import { translatePdfPagesIncrementally } from '../../src/pdf/translate-pdf';
import { createDefaultSettings } from '../../src/shared/config';

describe('translatePdfPagesIncrementally', () => {
  const pages = [
    createPage(1, ['Abstract', 'First paragraph']),
    createPage(2, ['Second page']),
  ];

  it('emits the first page before translating later pages', async () => {
    const events: string[][] = [];
    const translateSegments = vi.fn(async (segments: Array<{ id: string; text: string }>) => ({
      status: 'success' as const,
      translated: segments.map((segment) => ({
        id: segment.id,
        translatedText: `zh:${segment.text}`,
      })),
      failedBatches: [],
    }));

    await translatePdfPagesIncrementally({
      pages,
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache: createEmptyCache(),
      chunkSize: 2,
      concurrency: 1,
      translateSegments,
      onTranslationsReady: (translated) => {
        events.push(translated.map((item) => item.translatedText));
      },
    });

    expect(events).toEqual([
      ['zh:Abstract', 'zh:First paragraph'],
      ['zh:Second page'],
    ]);
    expect(translateSegments).toHaveBeenCalledTimes(2);
  });

  it('emits whichever translation chunk finishes first while concurrent chunks are running', async () => {
    const chunkResolvers: Array<() => void> = [];
    const events: string[][] = [];
    const translateSegments = vi.fn(
      (segments: Array<{ id: string; text: string }>) =>
        new Promise<{
          status: 'success';
          translated: Array<{ id: string; translatedText: string }>;
          failedBatches: [];
        }>((resolve) => {
          chunkResolvers.push(() =>
            resolve({
              status: 'success',
              translated: segments.map((segment) => ({
                id: segment.id,
                translatedText: `zh:${segment.text}`,
              })),
              failedBatches: [],
            }),
          );
        }),
    );

    const translation = translatePdfPagesIncrementally({
      pages: [
        createPage(1, ['A1', 'A2']),
        createPage(2, ['B1', 'B2']),
        createPage(3, ['C1', 'C2']),
      ],
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache: createEmptyCache(),
      chunkSize: 2,
      concurrency: 2,
      translateSegments,
      onTranslationsReady: (translated) => {
        events.push(translated.map((item) => item.translatedText));
      },
    });

    await vi.waitFor(() => expect(chunkResolvers).toHaveLength(2));

    chunkResolvers[1]();
    await vi.waitFor(() =>
      expect(events).toEqual([
        ['zh:B1', 'zh:B2'],
      ]),
    );
    await vi.waitFor(() => expect(chunkResolvers).toHaveLength(3));

    chunkResolvers[2]();
    chunkResolvers[0]();

    await translation;
    expect(events).toEqual([
      ['zh:B1', 'zh:B2'],
      ['zh:C1', 'zh:C2'],
      ['zh:A1', 'zh:A2'],
    ]);
  });

  it('starts concurrent chunks immediately instead of waiting for the first chunk to finish', async () => {
    const chunkResolvers: Array<() => void> = [];
    const events: string[][] = [];
    const translateSegments = vi.fn(
      (segments: Array<{ id: string; text: string }>) =>
        new Promise<{
          status: 'success';
          translated: Array<{ id: string; translatedText: string }>;
          failedBatches: [];
        }>((resolve) => {
          chunkResolvers.push(() =>
            resolve({
              status: 'success',
              translated: segments.map((segment) => ({
                id: segment.id,
                translatedText: `zh:${segment.text}`,
              })),
              failedBatches: [],
            }),
          );
        }),
    );

    const translation = translatePdfPagesIncrementally({
      pages: [
        createPage(1, ['A1', 'A2']),
        createPage(2, ['B1', 'B2']),
      ],
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache: createEmptyCache(),
      chunkSize: 2,
      concurrency: 2,
      translateSegments,
      onTranslationsReady: (translated) => {
        events.push(translated.map((item) => item.translatedText));
      },
    });

    await vi.waitFor(() => expect(chunkResolvers).toHaveLength(2));
    expect(translateSegments).toHaveBeenCalledTimes(2);

    chunkResolvers[0]();
    chunkResolvers[1]();
    await translation;
  });

  it('splits pdf requests by character budget so long pages produce smaller provider calls', async () => {
    const translateSegments = vi.fn(async (segments: Array<{ id: string; text: string }>) => ({
      status: 'success' as const,
      translated: segments.map((segment) => ({
        id: segment.id,
        translatedText: `zh:${segment.text}`,
      })),
      failedBatches: [],
    }));

    await translatePdfPagesIncrementally({
      pages: [createPage(1, ['AAAA', 'BBBB', 'CC'])],
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache: createEmptyCache(),
      chunkSize: 10,
      maxChunkCharacters: 6,
      concurrency: 1,
      translateSegments,
      onTranslationsReady: vi.fn(),
    });

    expect(translateSegments).toHaveBeenNthCalledWith(
      1,
      [{ id: 'pdf-page-1-block-0', text: 'AAAA' }],
      expect.any(Object),
    );
    expect(translateSegments).toHaveBeenNthCalledWith(
      2,
      [{ id: 'pdf-page-1-block-1', text: 'BBBB' }, { id: 'pdf-page-1-block-2', text: 'CC' }],
      expect.any(Object),
    );
  });

  it('uses cached page translations and only sends missing blocks to the provider', async () => {
    const cache = createMemoryCache(
      new Map([
        ['pdf-page-1-block-0', '缓存摘要'],
        ['pdf-page-1-block-1', '缓存第一段'],
      ]),
    );
    const translateSegments = vi.fn(async (segments: Array<{ id: string; text: string }>) => ({
      status: 'success' as const,
      translated: segments.map((segment) => ({
        id: segment.id,
        translatedText: `new:${segment.text}`,
      })),
      failedBatches: [],
    }));
    const events: string[][] = [];

    await translatePdfPagesIncrementally({
      pages,
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache,
      translateSegments,
      onTranslationsReady: (translated) => {
        events.push(translated.map((item) => item.translatedText));
      },
    });

    expect(events[0]).toEqual(['缓存摘要', '缓存第一段']);
    expect(translateSegments).toHaveBeenCalledTimes(1);
    expect(translateSegments).toHaveBeenCalledWith([
      { id: 'pdf-page-2-block-0', text: 'Second page' },
    ], expect.any(Object));
  });

  it('emits failed segment ids with the provider error message', async () => {
    const failures: Array<{ segmentIds: string[]; message: string }> = [];
    const translateSegments = vi.fn(async () => ({
      status: 'partial-success' as const,
      translated: [],
      failedBatches: [
        {
          segmentIds: ['pdf-page-1-block-0', 'pdf-page-1-block-1'],
          message: 'DeepSeek 请求过于频繁，请稍后重试。',
        },
      ],
    }));

    const result = await translatePdfPagesIncrementally({
      pages: [createPage(1, ['Abstract', 'First paragraph'])],
      sourceUrl: 'https://example.com/report.pdf',
      settings: createDefaultSettings(),
      cache: createEmptyCache(),
      chunkSize: 2,
      concurrency: 1,
      translateSegments,
      onTranslationsReady: vi.fn(),
      onTranslationsFailed: (failed) => {
        failures.push(...failed);
      },
    });

    expect(result.status).toBe('partial-success');
    expect(failures).toEqual([
      {
        segmentIds: ['pdf-page-1-block-0', 'pdf-page-1-block-1'],
        message: 'DeepSeek 请求过于频繁，请稍后重试。',
      },
    ]);
  });
});

function createPage(pageNumber: number, texts: string[]): PdfTextPage {
  return {
    pageNumber,
    text: texts.join('\n'),
    blocks: texts.map((text, readingOrder) => ({
      id: `pdf-page-${pageNumber}-block-${readingOrder}`,
      pageNumber,
      readingOrder,
      text,
      rect: { x: 0, y: 0, width: 100, height: 10 },
    })),
  };
}

function createEmptyCache() {
  return createMemoryCache(new Map());
}

function createMemoryCache(initialValues: Map<string, string>) {
  const values = new Map(initialValues);
  return {
    getPageTranslations: async (page: PdfTextPage) =>
      new Map(page.blocks.flatMap((block) => {
        const translatedText = values.get(block.id);
        return translatedText ? [[block.id, translatedText] as const] : [];
      })),
    setPageTranslations: async (
      _page: PdfTextPage,
      translated: Array<{ id: string; translatedText: string }>,
    ) => {
      for (const item of translated) {
        values.set(item.id, item.translatedText);
      }
    },
  };
}
