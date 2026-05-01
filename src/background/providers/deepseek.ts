import type { ProviderAdapter } from './types';
import {
  buildTranslationSystemPrompt,
  parseTranslatedSegments,
} from './parse-translated-segments';
import { logDebug } from '../../shared/debug';

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
    const requestPayload = {
      segments: request.segments,
      requiredOutputIds: request.segments.map((segment) => segment.id),
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      contentKind: request.contentKind ?? 'html-page',
      outputContract: {
        type: 'json_object',
        schema: {
          segments: request.segments.map((segment) => ({
            id: segment.id,
            translatedText: '<translate this segment text>',
          })),
        },
      },
    };
    try {
      logDebug('deepseek translation request payload', {
        providerId: 'deepseek',
        model: settings.model,
        baseUrl: settings.baseUrl,
        contentKind: requestPayload.contentKind,
        segmentCount: request.segments.length,
        segments: request.segments,
        requestPayload,
      });
      const response = (await transport({
        url: `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: {
          model: settings.model,
          thinking: {
            type: 'disabled',
          },
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: buildTranslationSystemPrompt(request.contentKind),
            },
            {
              role: 'user',
              content: JSON.stringify(requestPayload),
            },
          ],
        },
      })) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = response.choices?.[0]?.message?.content ?? '[]';
      logDebug('deepseek translation raw response', {
        providerId: 'deepseek',
        contentKind: requestPayload.contentKind,
        rawContent: content,
      });
      const segments = parseTranslatedSegments(content, request.segments);
      logDebug('deepseek translation parsed result', {
        providerId: 'deepseek',
        contentKind: requestPayload.contentKind,
        translatedCount: segments.length,
        segments,
      });

      return { ok: true, segments };
    } catch (error) {
      logDebug('deepseek translation failed with raw error', {
        providerId: 'deepseek',
        contentKind: requestPayload.contentKind,
        segmentCount: request.segments.length,
        segments: request.segments,
        message: getRawErrorMessage(error),
        normalizedMessage: deepseekProvider.normalizeError(error),
        status: getErrorStatus(error),
      });
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

      return `DeepSeek 请求失败（HTTP ${String(error.status)}）：${getRawErrorMessage(error)}`;
    }

    if (error instanceof SyntaxError) {
      return `DeepSeek 返回了无法解析的翻译结果：${error.message}`;
    }

    if (error instanceof Error && error.message.includes('malformed translated segments')) {
      return `DeepSeek 返回了格式不正确的翻译结果：${error.message}`;
    }

    return 'DeepSeek 请求失败，请检查 Base URL、模型和网络连接。';
  },
};

function getErrorStatus(error: unknown): unknown {
  return typeof error === 'object' && error && 'status' in error ? error.status : undefined;
}

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }

  return String(error);
}
