import type { ProviderAdapter } from './types';

export const traditionalProvider: ProviderAdapter<'traditional'> = {
  id: 'traditional',
  validateConfig(settings) {
    if (!settings.endpoint) {
      return { ok: false, message: 'Endpoint is required for traditional' };
    }

    return { ok: true };
  },
};
