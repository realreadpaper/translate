import { describe, expect, it, vi } from 'vitest';

import { deepseekProvider } from '../../../src/background/providers/deepseek';
import { openAiCompatibleProvider } from '../../../src/background/providers/openai-compatible';
import { traditionalProvider } from '../../../src/background/providers/traditional';

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

describe('traditionalProvider.translateSegments', () => {
  it('returns deterministic fallback translations for offline fixtures', async () => {
    const result = await traditionalProvider.translateSegments(
      {
        segments: [
          { id: 'seg-0', text: 'Hello world' },
          { id: 'seg-1', text: 'Custom sentence' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: '',
        endpoint: 'google-translate',
      },
      vi.fn(),
    );

    expect(result).toEqual({
      ok: true,
      segments: [
        { id: 'seg-0', translatedText: '你好，世界' },
        { id: 'seg-1', translatedText: '译文：Custom sentence' },
      ],
    });
  });
});

describe('deepseekProvider.translateSegments', () => {
  it('reuses the chat-completions transport contract for deepseek', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([{ id: 'seg-1', translatedText: '你好，世界' }]),
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [{ id: 'seg-1', text: 'Hello, world' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      },
      transport,
    );

    expect(transport).toHaveBeenCalledWith({
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        Authorization: 'Bearer deepseek-key',
      },
      body: {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              segments: [{ id: 'seg-1', text: 'Hello, world' }],
              sourceLanguage: 'en',
              targetLanguage: 'zh-CN',
            }),
          },
        ],
      },
    });
    expect(result).toEqual({
      ok: true,
      segments: [{ id: 'seg-1', translatedText: '你好，世界' }],
    });
  });
});
