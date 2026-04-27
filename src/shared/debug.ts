const DEBUG_PREFIX = '[Immersive AI Translate]';

export function isDebugLoggingEnabled(): boolean {
  const debugSetting = import.meta.env.VITE_EXTENSION_DEBUG_LOGS;
  if (debugSetting === 'false') {
    return false;
  }

  if (debugSetting === 'true') {
    return true;
  }

  return import.meta.env.DEV;
}

export function logDebug(message: string, details?: Record<string, unknown>) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(DEBUG_PREFIX, message, details ?? {});
}
