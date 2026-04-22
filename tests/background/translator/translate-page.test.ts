import { describe, expect, it } from 'vitest';

import { translatePageSegments } from '../../../src/background/translator/translate-page';

describe('translatePageSegments', () => {
  it('keeps successful batches when one batch fails', async () => {
    const result = await translatePageSegments(
      [
        { id: 'seg-0', text: 'first' },
        { id: 'seg-1', text: 'second' },
        { id: 'seg-2', text: 'third' },
      ],
      {
        providerId: 'openai-compatible',
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
      },
      async ({ segments }) => {
        if (segments[0].id === 'seg-2') {
          return { ok: false, message: 'rate limited' };
        }

        return {
          ok: true,
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: `${segment.text}-zh`,
          })),
        };
      },
      2,
    );

    expect(result).toEqual({
      status: 'partial-success',
      translated: [
        { id: 'seg-0', translatedText: 'first-zh' },
        { id: 'seg-1', translatedText: 'second-zh' },
      ],
      failedBatches: [{ segmentIds: ['seg-2'], message: 'rate limited' }],
    });
  });
});
