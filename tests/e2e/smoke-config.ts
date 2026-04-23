type EnvSource = Record<string, string | undefined>;

export function readDeepSeekSmokeConfig(env: EnvSource) {
  const enabled = env.PLAYWRIGHT_DEEPSEEK_SMOKE === '1';
  if (!enabled) {
    return {
      enabled: false as const,
      targetUrl: '',
      timeoutMs: 120_000,
    };
  }

  const targetUrl = env.PLAYWRIGHT_DEEPSEEK_SMOKE_URL?.trim() ?? '';
  if (!targetUrl) {
    throw new Error('PLAYWRIGHT_DEEPSEEK_SMOKE_URL is required when smoke mode is enabled');
  }

  const timeoutMs = Number.parseInt(env.PLAYWRIGHT_DEEPSEEK_SMOKE_TIMEOUT_MS ?? '120000', 10);

  return {
    enabled: true as const,
    targetUrl,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120_000,
  };
}
