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
