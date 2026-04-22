import type { ProviderAdapter } from './types';

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
};
