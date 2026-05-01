const DEBUG_PREFIX = '[Immersive AI Translate]';
let runtimeDebugLoggingEnabled = false;

export function configureRuntimeDebugLogging(enabled: boolean): void {
  runtimeDebugLoggingEnabled = enabled;
}

export function isDebugLoggingEnabled(): boolean {
  const debugSetting = import.meta.env.VITE_EXTENSION_DEBUG_LOGS;
  const releaseBuild = import.meta.env.VITE_RELEASE_BUILD === 'true';

  if (releaseBuild || debugSetting === 'false') {
    return false;
  }

  if (runtimeDebugLoggingEnabled || debugSetting === 'true') {
    return true;
  }

  return true;
}

export function logDebug(message: string, details?: Record<string, unknown>) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(DEBUG_PREFIX, message, details ?? {});
}
