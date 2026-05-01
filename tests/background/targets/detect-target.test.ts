import { describe, expect, it } from 'vitest';

import { detectTranslationTarget } from '../../../src/background/targets/detect-target';

describe('detectTranslationTarget', () => {
  it('honors an explicit html-page request from the floating ball', async () => {
    await expect(
      detectTranslationTarget(
        {
          id: 1,
          url: 'https://www.youtube.com/watch?v=demo',
          title: 'Demo',
        },
        'html-page',
      ),
    ).resolves.toEqual({
      kind: 'html-page',
      tabId: 1,
      url: 'https://www.youtube.com/watch?v=demo',
    });
  });

  it('detects youtube watch pages when no explicit target is requested', async () => {
    await expect(
      detectTranslationTarget({
        id: 2,
        url: 'https://www.youtube.com/watch?v=demo',
        title: 'Demo',
      }),
    ).resolves.toMatchObject({
      kind: 'youtube-subtitles',
      videoId: 'demo',
    });
  });

  it('detects standalone pdf documents', async () => {
    await expect(
      detectTranslationTarget({
        id: 3,
        url: 'https://example.com/report.pdf',
        title: 'report.pdf',
      }),
    ).resolves.toMatchObject({
      kind: 'pdf-document',
      displayName: 'report.pdf',
    });
  });

  it('detects pdf-like document routes without requiring a pdf suffix', async () => {
    await expect(
      detectTranslationTarget({
        id: 8,
        url: 'https://arxiv.org/pdf/2604.26805',
        title: '2604.26805',
      }),
    ).resolves.toEqual({
      kind: 'pdf-document',
      tabId: 8,
      url: 'https://arxiv.org/pdf/2604.26805',
      sourceKind: 'http-url',
      displayName: '2604.26805',
    });
  });

  it('detects pdf urls embedded in common query parameters', async () => {
    await expect(
      detectTranslationTarget({
        id: 9,
        url: 'https://example.com/viewer?file=https%3A%2F%2Fcdn.example.com%2Fpaper.pdf',
        title: 'viewer',
      }),
    ).resolves.toMatchObject({
      kind: 'pdf-document',
      url: 'https://cdn.example.com/paper.pdf',
      displayName: 'paper.pdf',
    });
  });

  it('detects pdf documents from the response content type when the url has no pdf suffix', async () => {
    await expect(
      detectTranslationTarget(
        {
          id: 5,
          url: 'https://example.com/download?id=report',
          title: 'download',
        },
        undefined,
        {
          getContentType: async () => 'application/pdf; charset=binary',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'pdf-document',
      displayName: 'download',
    });
  });

  it('detects chrome pdf viewer tabs and uses the embedded source pdf url', async () => {
    await expect(
      detectTranslationTarget({
        id: 7,
        url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?src=https%3A%2F%2Farxiv.org%2Fpdf%2F2604.26805',
        title: '2604.26805',
      }),
    ).resolves.toEqual({
      kind: 'pdf-document',
      tabId: 7,
      url: 'https://arxiv.org/pdf/2604.26805',
      sourceKind: 'http-url',
      displayName: '2604.26805',
    });
  });

  it('does not force youtube subtitles when an explicit youtube request is not a watch page', async () => {
    await expect(
      detectTranslationTarget(
        {
          id: 6,
          url: 'https://www.youtube.com/feed/subscriptions',
          title: 'Subscriptions',
        },
        'youtube-subtitles',
      ),
    ).resolves.toEqual({
      kind: 'html-page',
      tabId: 6,
      url: 'https://www.youtube.com/feed/subscriptions',
    });
  });

  it('falls back to html-page for normal articles', async () => {
    await expect(
      detectTranslationTarget({
        id: 4,
        url: 'https://example.com/article',
        title: 'Article',
      }),
    ).resolves.toMatchObject({
      kind: 'html-page',
    });
  });
});
