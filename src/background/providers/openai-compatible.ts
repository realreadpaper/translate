import type { ProviderAdapter } from './types';
import {
  buildTranslationSystemPrompt,
  parseTranslatedSegments,
} from './parse-translated-segments';
import { logDebug } from '../../shared/debug';

export const openAiCompatibleProvider: ProviderAdapter<'openai-compatible'> = {
  id: 'openai-compatible',
  validateConfig(settings) {
    if (!settings.apiKey) {
      return { ok: false, message: 'API Key is required for openai-compatible' };
    }

    if (!settings.baseUrl) {
      return { ok: false, message: 'Base URL is required for openai-compatible' };
    }

    if (!settings.model) {
      return { ok: false, message: 'Model is required for openai-compatible' };
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
      logDebug('openai-compatible translation request payload', {
        providerId: 'openai-compatible',
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
      logDebug('openai-compatible translation raw response', {
        providerId: 'openai-compatible',
        contentKind: requestPayload.contentKind,
        rawContent: content,
      });
      const segments = parseTranslatedSegments(content, request.segments);
      logDebug('openai-compatible translation parsed result', {
        providerId: 'openai-compatible',
        contentKind: requestPayload.contentKind,
        translatedCount: segments.length,
        segments,
      });

      return { ok: true, segments };
    } catch (error) {
      logDebug('openai-compatible translation failed with raw error', {
        providerId: 'openai-compatible',
        contentKind: requestPayload.contentKind,
        segmentCount: request.segments.length,
        segments: request.segments,
        message: getRawErrorMessage(error),
        normalizedMessage: openAiCompatibleProvider.normalizeError(error),
        status: getErrorStatus(error),
      });
      return { ok: false, message: openAiCompatibleProvider.normalizeError(error) };
    }
  },
  normalizeError(error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 429) {
      return 'Request was rate limited by openai-compatible';
    }

    return 'Request failed for openai-compatible';
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
