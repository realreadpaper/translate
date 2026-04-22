import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../../src/shared/config';
import {
  getProvider,
  validateProviderSettings,
} from '../../../src/background/providers/registry';

describe('provider registry', () => {
  it('returns a provider adapter for openai-compatible and deepseek', () => {
    expect(getProvider('openai-compatible').id).toBe('openai-compatible');
    expect(getProvider('deepseek').id).toBe('deepseek');
  });

  it('rejects missing api keys for ai providers', () => {
    const settings = createDefaultSettings();
    const result = validateProviderSettings('openai-compatible', {
      ...settings.providers['openai-compatible'],
      apiKey: '',
    });

    expect(result).toEqual({
      ok: false,
      message: 'API Key is required for openai-compatible',
    });
  });

  it('allows traditional provider without a model', () => {
    const result = validateProviderSettings('traditional', {
      apiKey: '',
      endpoint: 'google-translate',
    });

    expect(result).toEqual({ ok: true });
  });
});
