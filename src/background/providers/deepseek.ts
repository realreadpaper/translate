import type { ProviderAdapter } from './types';

export const deepseekProvider: ProviderAdapter<'deepseek'> = {
  id: 'deepseek',
  validateConfig(settings) {
    if (!settings.apiKey) {
      return { ok: false, message: 'API Key is required for deepseek' };
    }

    if (!settings.baseUrl) {
      return { ok: false, message: 'Base URL is required for deepseek' };
    }

    if (!settings.model) {
      return { ok: false, message: 'Model is required for deepseek' };
    }

    return { ok: true };
  },
  async translateSegments(request, settings, transport) {
    try {
      const response = (await transport({
        url: `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: {
          model: settings.model,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                segments: request.segments,
                sourceLanguage: request.sourceLanguage,
                targetLanguage: request.targetLanguage,
              }),
            },
          ],
        },
      })) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = response.choices?.[0]?.message?.content ?? '[]';
      const segments = JSON.parse(content) as Array<{ id: string; translatedText: string }>;

      return { ok: true, segments };
    } catch (error) {
      return { ok: false, message: deepseekProvider.normalizeError(error) };
    }
  },
  normalizeError(error) {
    if (typeof error === 'object' && error && 'status' in error) {
      if (error.status === 401) {
        return 'DeepSeek 鉴权失败，请检查 API Key 是否正确。';
      }

      if (error.status === 429) {
        return 'DeepSeek 请求过于频繁，请稍后重试。';
      }

      if (error.status === 403) {
        return 'DeepSeek 拒绝了当前请求，请检查账号权限或额度。';
      }
    }

    return 'DeepSeek 请求失败，请检查 Base URL、模型和网络连接。';
  },
};
