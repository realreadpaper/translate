import { describe, expect, it } from 'vitest';

import { readDeepSeekSmokeConfig } from './smoke-config';

describe('readDeepSeekSmokeConfig', () => {
  it('stays disabled by default', () => {
    expect(readDeepSeekSmokeConfig({})).toEqual({
      enabled: false,
      targetUrl: '',
      timeoutMs: 120_000,
    });
  });

  it('throws when smoke mode is enabled without a target url', () => {
    expect(() =>
      readDeepSeekSmokeConfig({
        PLAYWRIGHT_DEEPSEEK_SMOKE: '1',
      }),
    ).toThrow('PLAYWRIGHT_DEEPSEEK_SMOKE_URL is required when smoke mode is enabled');
  });

  it('reads the target url and timeout override', () => {
    expect(
      readDeepSeekSmokeConfig({
        PLAYWRIGHT_DEEPSEEK_SMOKE: '1',
        PLAYWRIGHT_DEEPSEEK_SMOKE_URL: 'https://example.com/article',
        PLAYWRIGHT_DEEPSEEK_SMOKE_TIMEOUT_MS: '90000',
      }),
    ).toEqual({
      enabled: true,
      targetUrl: 'https://example.com/article',
      timeoutMs: 90_000,
    });
  });
});
