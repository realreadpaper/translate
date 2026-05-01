import type { ExtensionSettings } from '../shared/types';
import type { PdfTextBlock } from './pdf-text-blocks';
import type { PdfTextPage } from './pdf-text';

type CacheStorage = {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
};

export type PdfTranslationCacheKeyInput = {
  sourceUrl: string;
  pageNumber: number;
  blockText: string;
  providerId: ExtensionSettings['providerId'];
  sourceLanguage: string;
  targetLanguage: string;
};

type CacheReadInput = {
  id: string;
  keyInput: PdfTranslationCacheKeyInput;
};

type CacheWriteInput = {
  keyInput: PdfTranslationCacheKeyInput;
  translatedText: string;
};

export type PdfPageTranslationCache = {
  getPageTranslations: (page: PdfTextPage) => Promise<Map<string, string>>;
  setPageTranslations: (
    page: PdfTextPage,
    translated: Array<{ id: string; translatedText: string }>,
  ) => Promise<void>;
};

const CACHE_PREFIX = 'pdf-translation-cache:v1';

export function createPdfTranslationCache(storage: CacheStorage) {
  return {
    async getTranslations(items: CacheReadInput[]): Promise<Map<string, string>> {
      const keyPairs = await Promise.all(
        items.map(async (item) => ({
          id: item.id,
          key: await createPdfTranslationCacheKey(item.keyInput),
        })),
      );
      const cached = await storage.get(keyPairs.map((item) => item.key));
      const translatedById = new Map<string, string>();

      for (const item of keyPairs) {
        const value = cached[item.key];
        if (typeof value === 'string' && value.trim()) {
          translatedById.set(item.id, value);
        }
      }

      return translatedById;
    },

    async setTranslations(items: CacheWriteInput[]): Promise<void> {
      const values: Record<string, string> = {};
      for (const item of items) {
        values[await createPdfTranslationCacheKey(item.keyInput)] = item.translatedText;
      }

      if (Object.keys(values).length > 0) {
        await storage.set(values);
      }
    },
  };
}

export function createPdfPageTranslationCache({
  sourceUrl,
  settings,
  storage = chrome.storage.local,
}: {
  sourceUrl: string;
  settings: ExtensionSettings;
  storage?: CacheStorage;
}): PdfPageTranslationCache {
  const cache = createPdfTranslationCache(storage);

  return {
    getPageTranslations(page) {
      return cache.getTranslations(
        page.blocks.map((block) => ({
          id: block.id,
          keyInput: createBlockKeyInput(sourceUrl, settings, block),
        })),
      );
    },

    setPageTranslations(page, translated) {
      const blockById = new Map(page.blocks.map((block) => [block.id, block]));
      return cache.setTranslations(
        translated.flatMap((item) => {
          const block = blockById.get(item.id);
          if (!block) {
            return [];
          }

          return [
            {
              keyInput: createBlockKeyInput(sourceUrl, settings, block),
              translatedText: item.translatedText,
            },
          ];
        }),
      );
    },
  };
}

export async function createPdfTranslationCacheKey(
  input: PdfTranslationCacheKeyInput,
): Promise<string> {
  const raw = JSON.stringify({
    sourceUrl: input.sourceUrl,
    pageNumber: input.pageNumber,
    blockText: input.blockText,
    providerId: input.providerId,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
  });

  return `${CACHE_PREFIX}:${stableHash(raw)}`;
}

function createBlockKeyInput(
  sourceUrl: string,
  settings: ExtensionSettings,
  block: PdfTextBlock,
): PdfTranslationCacheKeyInput {
  return {
    sourceUrl,
    pageNumber: block.pageNumber,
    blockText: block.text,
    providerId: settings.providerId,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
