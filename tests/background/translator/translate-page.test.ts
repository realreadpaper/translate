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

  it('throws when batchSize is not greater than 0', async () => {
    await expect(
      translatePageSegments(
        [{ id: 'seg-0', text: 'first' }],
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
        async ({ segments }) => ({
          ok: true,
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: `${segment.text}-zh`,
          })),
        }),
        0,
      ),
    ).rejects.toThrow('batch size must be greater than 0');
  });

  it('records thrown translateBatch errors as failed batches and continues', async () => {
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
        if (segments[0].id === 'seg-0') {
          return {
            ok: true,
            segments: segments.map((segment) => ({
              id: segment.id,
              translatedText: `${segment.text}-zh`,
            })),
          };
        }

        throw new Error('network down');
      },
      2,
    );

    expect(result).toEqual({
      status: 'partial-success',
      translated: [
        { id: 'seg-0', translatedText: 'first-zh' },
        { id: 'seg-1', translatedText: 'second-zh' },
      ],
      failedBatches: [{ segmentIds: ['seg-2'], message: 'network down' }],
    });
  });

  it('records malformed successful batch payloads instead of throwing spread errors', async () => {
    const result = await translatePageSegments(
      [
        { id: 'seg-0', text: 'first' },
        { id: 'seg-1', text: 'second' },
      ],
      {
        providerId: 'deepseek',
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
      },
      async () =>
        ({
          ok: true,
          segments: { id: 'seg-0', translatedText: 'first-zh' },
        }) as never,
      2,
    );

    expect(result).toEqual({
      status: 'partial-success',
      translated: [],
      failedBatches: [
        {
          segmentIds: ['seg-0', 'seg-1'],
          message: 'Provider returned malformed translated segments.',
        },
      ],
    });
  });
});
