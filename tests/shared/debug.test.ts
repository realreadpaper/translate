import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureRuntimeDebugLogging,
  isDebugLoggingEnabled,
  logDebug,
} from '../../src/shared/debug';

describe('debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    configureRuntimeDebugLogging(false);
  });

  it('can be disabled for release builds', () => {
    vi.stubEnv('VITE_RELEASE_BUILD', 'true');
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

  it('is enabled by default for non-release extension builds', () => {
    vi.stubEnv('VITE_RELEASE_BUILD', '');
    vi.stubEnv('VITE_EXTENSION_DEBUG_LOGS', '');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logDebug('debug build log should be visible', { area: 'pdf' });

    expect(isDebugLoggingEnabled()).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'debug build log should be visible',
      { area: 'pdf' },
    );
  });

  it('keeps release builds quiet even when runtime settings request logs', () => {
    vi.stubEnv('VITE_RELEASE_BUILD', 'true');
    vi.stubEnv('VITE_EXTENSION_DEBUG_LOGS', 'false');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    configureRuntimeDebugLogging(true);
    logDebug('runtime log should stay quiet in release', { step: 'content-init' });

    expect(isDebugLoggingEnabled()).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
