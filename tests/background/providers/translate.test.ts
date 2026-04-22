import { describe, expect, it, vi } from 'vitest';

import { openAiCompatibleProvider } from '../../../src/background/providers/openai-compatible';

describe('openAiCompatibleProvider.translateSegments', () => {
  it('returns normalized translated segments', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([{ id: 'seg-1', translatedText: '你好，世界' }]),
          },
        },
      ],
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [{ id: 'seg-1', text: 'Hello, world' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [{ id: 'seg-1', translatedText: '你好，世界' }],
    });
  });

  it('normalizes transport failures into readable errors', async () => {
    const transport = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Too Many Requests',
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [{ id: 'seg-1', text: 'Hello, world' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    );

    expect(result).toEqual({
      ok: false,
      message: 'Request was rate limited by openai-compatible',
    });
  });
});
