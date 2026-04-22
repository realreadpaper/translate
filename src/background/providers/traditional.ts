import type { ProviderAdapter } from './types';

export const traditionalProvider: ProviderAdapter<'traditional'> = {
  id: 'traditional',
  validateConfig(settings) {
    if (!settings.endpoint) {
      return { ok: false, message: 'Endpoint is required for traditional' };
    }

    return { ok: true };
  },
  async translateSegments() {
    return { ok: false, message: 'Not implemented for traditional' };
  },
  normalizeError() {
    return 'Request failed for traditional';
  },
};
