import type { ProviderId, ProviderSettingsById } from '../../shared/types';
import { deepseekProvider } from './deepseek';
import { openAiCompatibleProvider } from './openai-compatible';
import { traditionalProvider } from './traditional';
import type { ProviderAdapter, ValidationResult } from './types';

const providers = {
  'openai-compatible': openAiCompatibleProvider,
  deepseek: deepseekProvider,
  traditional: traditionalProvider,
} satisfies Record<ProviderId, ProviderAdapter>;

export function getProvider<T extends ProviderId>(id: T): ProviderAdapter<T> {
  return providers[id] as ProviderAdapter<T>;
}

export function validateProviderSettings<T extends ProviderId>(
  id: T,
  settings: ProviderSettingsById[T],
): ValidationResult {
  return getProvider(id).validateConfig(settings);
}
