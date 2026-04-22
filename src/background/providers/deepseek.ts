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
};
