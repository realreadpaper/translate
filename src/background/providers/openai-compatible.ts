import type { ProviderAdapter } from './types';
import {
  parseTranslatedSegments,
  TRANSLATION_SYSTEM_PROMPT,
} from './parse-translated-segments';

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
              role: 'system',
              content: TRANSLATION_SYSTEM_PROMPT,
            },
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
      const segments = parseTranslatedSegments(content);

      return { ok: true, segments };
    } catch (error) {
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
