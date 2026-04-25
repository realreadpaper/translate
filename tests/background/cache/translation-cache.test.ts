import { beforeEach, describe, expect, it } from 'vitest';

import { createTranslationCache } from '../../../src/background/cache/translation-cache';

describe('createTranslationCache', () => {
  let cache: ReturnType<typeof createTranslationCache>;

  beforeEach(() => {
    cache = createTranslationCache();
  });

  it('stores and retrieves youtube translations by video and track key', () => {
    cache.set('youtube:abc:en:zh-CN:deepseek-v4-flash', [
      { id: 'cue-0', translatedText: '你好' },
    ]);

    expect(cache.get('youtube:abc:en:zh-CN:deepseek-v4-flash')).toEqual([
      { id: 'cue-0', translatedText: '你好' },
    ]);
  });
});
