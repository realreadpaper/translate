import type { ProviderId, ProviderSettingsById } from '../../shared/types';

export type ValidationResult = { ok: true } | { ok: false; message: string };

export type TranslationRequest = {
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  contentKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
};

export type TranslationResult =
  | { ok: true; segments: Array<{ id: string; translatedText: string }> }
  | { ok: false; message: string };

export type ProviderTransport = (request: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}) => Promise<unknown>;

export type ProviderAdapter<T extends ProviderId = ProviderId> = {
  id: T;
  validateConfig(settings: ProviderSettingsById[T]): ValidationResult;
  translateSegments(
    request: TranslationRequest,
    settings: ProviderSettingsById[T],
    transport: ProviderTransport,
  ): Promise<TranslationResult>;
  normalizeError(error: unknown): string;
};
