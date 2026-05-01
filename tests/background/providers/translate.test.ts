import { afterEach, describe, expect, it, vi } from 'vitest';

import { deepseekProvider } from '../../../src/background/providers/deepseek';
import { openAiCompatibleProvider } from '../../../src/background/providers/openai-compatible';
import { traditionalProvider } from '../../../src/background/providers/traditional';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('accepts model responses wrapped in markdown json fences and a segments object', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n{"segments":[{"id":"seg-1","translatedText":"你好，世界"}]}\n```',
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

  it('fills missing ids by request order when the returned string array count matches', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(['摘要', '方法']),
          },
        },
      ],
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
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
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '摘要' },
        { id: 'pdf-page-1-block-1', translatedText: '方法' },
      ],
    });
  });

  it('accepts id-preserving translated fields returned under common provider aliases', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              segments: [
                { id: 'pdf-page-1-block-0', translation: '摘要' },
                { id: 'pdf-page-1-block-1', targetText: '方法' },
              ],
            }),
          },
        },
      ],
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
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
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '摘要' },
        { id: 'pdf-page-1-block-1', translatedText: '方法' },
      ],
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
  it('logs pdf translation request text and parsed translation result without exposing the api key', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { id: 'pdf-page-1-block-0', translatedText: '摘要' },
            ]),
          },
        },
      ],
    });

    await deepseekProvider.translateSegments(
      {
        segments: [{ id: 'pdf-page-1-block-0', text: 'Abstract' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-secret-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'deepseek translation request payload',
      expect.objectContaining({
        providerId: 'deepseek',
        contentKind: 'pdf-document',
        segments: [{ id: 'pdf-page-1-block-0', text: 'Abstract' }],
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'deepseek translation parsed result',
      expect.objectContaining({
        segments: [{ id: 'pdf-page-1-block-0', translatedText: '摘要' }],
      }),
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('deepseek-secret-key');
  });

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
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(transport).toHaveBeenCalledWith({
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        Authorization: 'Bearer deepseek-key',
      },
        body: {
          model: 'deepseek-v4-flash',
          thinking: {
            type: 'disabled',
          },
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: expect.stringContaining('professional translation engine'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              segments: [{ id: 'seg-1', text: 'Hello, world' }],
              requiredOutputIds: ['seg-1'],
              sourceLanguage: 'en',
              targetLanguage: 'zh-CN',
              contentKind: 'html-page',
              outputContract: {
                type: 'json_object',
                schema: {
                  segments: [
                    {
                      id: 'seg-1',
                      translatedText: '<translate this segment text>',
                    },
                  ],
                },
              },
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

  it('fills missing ids by request order when translatedText object count matches', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { translatedText: '摘要' },
              { translatedText: '方法' },
            ]),
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '摘要' },
        { id: 'pdf-page-1-block-1', translatedText: '方法' },
      ],
    });
  });

  it('accepts provider object maps keyed by segment id', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translations: {
                'pdf-page-1-block-0': '摘要',
                'pdf-page-1-block-1': '方法',
              },
            }),
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '摘要' },
        { id: 'pdf-page-1-block-1', translatedText: '方法' },
      ],
    });
  });

  it('recovers deepseek json-like responses with unquoted translatedText values', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"segments":[{"id":"pdf-page-1-block-0","translatedText":我们从四个维度评估 BIAN QUE。},{"id":"pdf-page-1-block-1","translatedText":这些结果表明该框架有效。}]}',
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'We evaluate Bian Que from four dimensions.' },
          { id: 'pdf-page-1-block-1', text: 'These results show that the framework works.' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '我们从四个维度评估 BIAN QUE。' },
        { id: 'pdf-page-1-block-1', translatedText: '这些结果表明该框架有效。' },
      ],
    });
  });

  it('recovers id-less deepseek json-like responses with unquoted translatedText values by request order', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"segments":[{"translatedText":摘要},{"translatedText":方法}]}',
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [
        { id: 'pdf-page-1-block-0', translatedText: '摘要' },
        { id: 'pdf-page-1-block-1', translatedText: '方法' },
      ],
    });
  });

  it('keeps malformed failures when id-less results do not match the requested count', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([{ translatedText: '摘要' }]),
          },
        },
      ],
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [
          { id: 'pdf-page-1-block-0', text: 'Abstract' },
          { id: 'pdf-page-1-block-1', text: 'Method' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: false,
      message:
        'DeepSeek 返回了格式不正确的翻译结果：Provider returned malformed translated segments.',
    });
  });

  it('keeps the raw deepseek status and message for unknown transport failures', async () => {
    const transport = vi.fn().mockRejectedValue({
      status: 400,
      message: '{"error":{"message":"maximum context length exceeded"}}',
    });

    const result = await deepseekProvider.translateSegments(
      {
        segments: [{ id: 'pdf-page-1-block-0', text: 'Long PDF paragraph' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    expect(result).toEqual({
      ok: false,
      message:
        'DeepSeek 请求失败（HTTP 400）：{"error":{"message":"maximum context length exceeded"}}',
    });
  });

  it('uses academic pdf translation instructions when translating pdf document segments', async () => {
    const referenceText =
      '[46] Tianxin Wei, Noveen Sachdeva, Benjamin Coleman, Zhankui He, Yuanchen Bei, Xuying Ning, Mengting Ai, Yunzhe Li, Jingrui He, Ed H Chi, et al. Evo-memory: Benchmarking llm agent test-time learning with self-evolving memory. arXiv preprint arXiv:2511.20857, 2025.';
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              segments: [
                { id: 'pdf-page-1-block-0', translatedText: referenceText },
              ],
            }),
          },
        },
      ],
    });

    await deepseekProvider.translateSegments(
      {
        segments: [{ id: 'pdf-page-1-block-0', text: referenceText }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        contentKind: 'pdf-document',
      },
      {
        apiKey: 'deepseek-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-flash',
      },
      transport,
    );

    const body = transport.mock.calls[0][0].body as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.messages[0].content).toContain('academic or technical PDF');
    expect(body.messages[0].content).toContain('"segments":[{"id":"same id","translatedText":"translation"}]');
    expect(body.messages[0].content).toContain('Preserve formulas, citations, references, code identifiers');
    expect(body.messages[0].content).toContain('Bibliography and reference-list entries must not be translated');
    expect(body.messages[0].content).toContain('[46] Tianxin Wei');
    expect(body.messages[1].content).toContain('"contentKind":"pdf-document"');
    expect(body.messages[1].content).toContain('"requiredOutputIds":["pdf-page-1-block-0"]');
  });
});
