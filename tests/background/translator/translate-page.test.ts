import { describe, expect, it } from 'vitest';

import { translatePageSegments } from '../../../src/background/translator/translate-page';

describe('translatePageSegments', () => {
  it('defaults auto source language to English when the batch is English text', async () => {
    const translateCalls: Array<{ sourceLanguage: string; targetLanguage: string }> = [];

    await translatePageSegments(
      [{ id: 'seg-0', text: 'Tonight I will study the meeting reports.' }],
      {
        providerId: 'deepseek',
        sourceLanguage: 'auto',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
      },
      async ({ segments, sourceLanguage, targetLanguage }) => {
        translateCalls.push({ sourceLanguage, targetLanguage });
        return {
          ok: true,
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: '今晚我会研究会议报告。',
          })),
        };
      },
      2,
    );

    expect(translateCalls).toEqual([{ sourceLanguage: 'en', targetLanguage: 'zh-CN' }]);
  });

  it('skips Chinese auto source batches when the target is already Chinese', async () => {
    const translateCalls: Array<{ sourceLanguage: string; targetLanguage: string }> = [];

    const result = await translatePageSegments(
      [
        {
          id: 'seg-0',
          text: '睡前福利：海科新源301292 富婆提示：84.00附近低吸介入！',
        },
      ],
      {
        providerId: 'deepseek',
        sourceLanguage: 'auto',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
      },
      async ({ segments, sourceLanguage, targetLanguage }) => {
        translateCalls.push({ sourceLanguage, targetLanguage });
        return {
          ok: true,
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: 'Bedtime perk: Haike Xinyuan 301292.',
          })),
        };
      },
      2,
    );

    expect(translateCalls).toEqual([]);
    expect(result).toEqual({
      status: 'success',
      translated: [],
      failedBatches: [],
    });
  });

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

  it('retries malformed translation payloads once before marking the batch failed', async () => {
    let attempts = 0;

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
      async ({ segments }) => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false,
            message:
              'DeepSeek 返回了格式不正确的翻译结果：Provider returned malformed translated segments.',
          };
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

    expect(attempts).toBe(2);
    expect(result).toEqual({
      status: 'success',
      translated: [
        { id: 'seg-0', translatedText: 'first-zh' },
        { id: 'seg-1', translatedText: 'second-zh' },
      ],
      failedBatches: [],
    });
  });

  it('retries unparseable json translation payloads once before marking the batch failed', async () => {
    let attempts = 0;

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
      async ({ segments }) => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false,
            message:
              'DeepSeek 返回了无法解析的翻译结果：Unexpected token \'我\', ..."atedText":我们从四个维度评估B"... is not valid JSON',
          };
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

    expect(attempts).toBe(2);
    expect(result).toEqual({
      status: 'success',
      translated: [
        { id: 'seg-0', translatedText: 'first-zh' },
        { id: 'seg-1', translatedText: 'second-zh' },
      ],
      failedBatches: [],
    });
  });
});
