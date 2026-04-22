import type { ProviderId, ProviderSettingsById } from '../../shared/types';

export type ValidationResult = { ok: true } | { ok: false; message: string };

export type ProviderAdapter<T extends ProviderId = ProviderId> = {
  id: T;
  validateConfig(settings: ProviderSettingsById[T]): ValidationResult;
};
