import { afterEach, describe, expect, it, vi } from 'vitest';

import { isDebugLoggingEnabled, logDebug } from '../../src/shared/debug';

describe('debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('can be disabled for release builds', () => {
    vi.stubEnv('VITE_EXTENSION_DEBUG_LOGS', 'false');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logDebug('release log should stay quiet', { count: 1 });

    expect(isDebugLoggingEnabled()).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('can be enabled explicitly for debug builds', () => {
    vi.stubEnv('VITE_EXTENSION_DEBUG_LOGS', 'true');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logDebug('debug log should be visible', { count: 1 });

    expect(isDebugLoggingEnabled()).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'debug log should be visible',
      { count: 1 },
    );
  });
});
