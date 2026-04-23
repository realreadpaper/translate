import { describe, expect, it, vi } from 'vitest';

import { testProviderConnection } from '../../../src/background/providers/connection';

describe('testProviderConnection', () => {
  it('returns a readable validation error for invalid deepseek settings', async () => {
    await expect(
      testProviderConnection(
        'deepseek',
        {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        vi.fn(),
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'API Key is required for deepseek',
    });
  });

  it('returns success when the provider responds to a lightweight probe', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'OK',
          },
        },
      ],
    });

    await expect(
      testProviderConnection(
        'deepseek',
        {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        transport,
      ),
    ).resolves.toEqual({
      ok: true,
      message: '连接成功',
    });
  });

  it('treats any non-empty assistant text as a successful probe response', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'DeepSeek connection ready',
          },
        },
      ],
    });

    await expect(
      testProviderConnection(
        'deepseek',
        {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        transport,
      ),
    ).resolves.toEqual({
      ok: true,
      message: '连接成功',
    });
  });

  it('maps deepseek authentication failures into readable guidance', async () => {
    const transport = vi.fn().mockRejectedValue({
      status: 401,
      message: 'Unauthorized',
    });

    await expect(
      testProviderConnection(
        'deepseek',
        {
          apiKey: 'bad-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        transport,
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'DeepSeek 鉴权失败，请检查 API Key 是否正确。',
    });
  });

  it('maps deepseek rate limit failures into retry guidance', async () => {
    const transport = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Too Many Requests',
    });

    await expect(
      testProviderConnection(
        'deepseek',
        {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        transport,
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'DeepSeek 请求过于频繁，请稍后重试。',
    });
  });
});
