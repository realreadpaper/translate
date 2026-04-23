import type { ProviderAdapter } from './types';

const FALLBACK_TRANSLATIONS: Record<string, string> = {
  'Hello world': '你好，世界',
  'Welcome to immersive translation.': '欢迎使用沉浸式翻译。',
};

export const traditionalProvider: ProviderAdapter<'traditional'> = {
  id: 'traditional',
  validateConfig(settings) {
    if (!settings.endpoint) {
      return { ok: false, message: 'Endpoint is required for traditional' };
    }

    return { ok: true };
  },
  async translateSegments(request) {
    return {
      ok: true,
      segments: request.segments.map((segment) => ({
        id: segment.id,
        translatedText: FALLBACK_TRANSLATIONS[segment.text] ?? `译文：${segment.text}`,
      })),
    };
  },
  normalizeError() {
    return 'Request failed for traditional';
  },
};
