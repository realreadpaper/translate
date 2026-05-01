import { getProvider } from '../background/providers/registry';
import { postJson } from '../background/providers/transport';
import type {
  DeepSeekProviderSettings,
  ExtensionSettings,
  OpenAICompatibleProviderSettings,
  TraditionalProviderSettings,
} from '../shared/types';
import { DEFAULT_PAGE_TRANSLATION_BATCH_SIZE } from '../background/translator/config';
import { chunkSegments } from '../background/translator/batch';
import { translatePageSegments } from '../background/translator/translate-page';
import { logDebug } from '../shared/debug';
import type { PdfTextPage } from './pdf-text';
import type { PdfPageTranslationCache } from './pdf-translation-cache';

type SourceSegment = { id: string; text: string };
const PDF_TRANSLATION_BATCH_SIZE = DEFAULT_PAGE_TRANSLATION_BATCH_SIZE;
const PDF_TRANSLATION_BATCH_MAX_CHARS = 1800;
const PDF_TRANSLATION_CONCURRENCY = 4;
type TranslationResult = Awaited<ReturnType<typeof translatePdfSegments>>;
type TranslationFailure = TranslationResult['failedBatches'][number];

export type PdfPageTranslationProgress = {
  chunkIndex: number;
  chunkCount: number;
  cachedCount: number;
  missingCount: number;
  translatedCount: number;
  totalCount: number;
};

export async function translatePdfPagesIncrementally({
  pages,
  sourceUrl,
  settings,
  cache,
  translateSegments = translatePdfSegments,
  onTranslationsReady,
  onTranslationsFailed,
  onChunkStarting,
  chunkSize = PDF_TRANSLATION_BATCH_SIZE,
  maxChunkCharacters = PDF_TRANSLATION_BATCH_MAX_CHARS,
  concurrency = PDF_TRANSLATION_CONCURRENCY,
}: {
  pages: PdfTextPage[];
  sourceUrl: string;
  settings: ExtensionSettings;
  cache: PdfPageTranslationCache;
  translateSegments?: typeof translatePdfSegments;
  chunkSize?: number;
  maxChunkCharacters?: number;
  concurrency?: number;
  onChunkStarting?: (progress: PdfPageTranslationProgress) => void;
  onTranslationsReady: (
    translated: Array<{ id: string; translatedText: string }>,
    progress: PdfPageTranslationProgress,
  ) => void;
  onTranslationsFailed?: (
    failed: TranslationFailure[],
    progress: PdfPageTranslationProgress,
  ) => void;
}): Promise<TranslationResult> {
  const allTranslated: TranslationResult['translated'] = [];
  const allFailedBatches: TranslationResult['failedBatches'] = [];
  const missingSegments: SourceSegment[] = [];
  const pageByBlockId = new Map<string, PdfTextPage>();
  let cachedCount = 0;
  const totalCount = pages.reduce((total, page) => total + page.blocks.length, 0);

  logDebug('pdf incremental translation preparing cache scan', {
    sourceUrl,
    pageCount: pages.length,
    totalCount,
    providerId: settings.providerId,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    chunkSize,
    maxChunkCharacters,
    concurrency,
  });

  for (const page of pages) {
    const cachedById = await cache.getPageTranslations(page);
    logDebug('pdf page cache checked', {
      pageNumber: page.pageNumber,
      blockCount: page.blocks.length,
      cachedCount: cachedById.size,
    });
    const cachedTranslated = page.blocks.flatMap((block) => {
      pageByBlockId.set(block.id, page);
      const translatedText = cachedById.get(block.id);
      if (!translatedText) {
        missingSegments.push({ id: block.id, text: block.text });
        return [];
      }

      return [{ id: block.id, translatedText }];
    });

    cachedCount += cachedTranslated.length;
    if (cachedTranslated.length > 0) {
      allTranslated.push(...cachedTranslated);
      logDebug('pdf cached translations emitted', {
        emittedCount: cachedTranslated.length,
        totalTranslatedCount: allTranslated.length,
      });
      onTranslationsReady(cachedTranslated, {
        chunkIndex: 0,
        chunkCount: 0,
        cachedCount,
        missingCount: missingSegments.length,
        translatedCount: allTranslated.length,
        totalCount,
      });
    }
  }

  const chunks = chunkPdfSegments(missingSegments, chunkSize, maxChunkCharacters);
  logDebug('pdf incremental translation chunks created', {
    missingCount: missingSegments.length,
    chunkCount: chunks.length,
    chunkSize,
    maxChunkCharacters,
    firstChunkSize: chunks[0]?.length ?? 0,
  });
  let nextChunkIndex = 0;

  async function translateNextChunk(): Promise<boolean> {
    const chunkIndex = nextChunkIndex;
    nextChunkIndex += 1;
    const chunk = chunks[chunkIndex];
    if (!chunk) {
      return false;
    }

    const progress = {
      chunkIndex,
      chunkCount: chunks.length,
      cachedCount,
      missingCount: missingSegments.length,
      translatedCount: allTranslated.length,
      totalCount,
    };
    logDebug('pdf translation chunk starting', {
      chunkIndex,
      chunkCount: chunks.length,
      segmentCount: chunk.length,
      firstSegmentId: chunk[0]?.id,
      lastSegmentId: chunk.at(-1)?.id,
      translatedCount: allTranslated.length,
      sourceSegments: chunk,
    });
    onChunkStarting?.(progress);

    try {
      const result = await translateSegments(chunk, settings);
      logDebug('pdf translation chunk completed', {
        chunkIndex,
        translatedCount: result.translated.length,
        failedBatchCount: result.failedBatches.length,
        failedMessages: result.failedBatches.map((batch) => batch.message),
        translatedSegments: result.translated,
      });
      allFailedBatches.push(...result.failedBatches);
      allTranslated.push(...result.translated);
      await cacheTranslatedChunks(result.translated, pageByBlockId, cache);
      logDebug('pdf translation chunk cached and emitted', {
        chunkIndex,
        emittedCount: result.translated.length,
        totalTranslatedCount: allTranslated.length,
      });
      const nextProgress = {
        ...progress,
        translatedCount: allTranslated.length,
      };
      if (result.translated.length > 0) {
        onTranslationsReady(result.translated, nextProgress);
      }
      if (result.failedBatches.length > 0) {
        onTranslationsFailed?.(result.failedBatches, nextProgress);
      }
    } catch (error) {
      const failedBatch = {
        segmentIds: chunk.map((segment) => segment.id),
        message: error instanceof Error ? error.message : String(error),
      };
      logDebug('pdf translation chunk threw', {
        chunkIndex,
        segmentCount: chunk.length,
        message: failedBatch.message,
      });
      allFailedBatches.push(failedBatch);
      onTranslationsFailed?.([failedBatch], progress);
    }

    return true;
  }

  async function translateRemainingChunks(): Promise<void> {
    while (await translateNextChunk()) {
      // Keep this worker busy until no queued chunks remain.
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), chunks.length);
  logDebug('pdf translation concurrent workers starting', {
    chunkCount: chunks.length,
    workerCount,
  });
  await Promise.all(
    Array.from({ length: workerCount }, () => translateRemainingChunks()),
  );

  logDebug('pdf incremental translation finished', {
    status: allFailedBatches.length > 0 ? 'partial-success' : 'success',
    translatedCount: allTranslated.length,
    failedBatchCount: allFailedBatches.length,
  });
  return {
    status: allFailedBatches.length > 0 ? 'partial-success' : 'success',
    translated: allTranslated,
    failedBatches: allFailedBatches,
  };
}

function chunkPdfSegments(
  segments: SourceSegment[],
  maxSegments: number,
  maxCharacters: number,
): SourceSegment[][] {
  if (maxSegments <= 0) {
    throw new Error('batch size must be greater than 0');
  }

  if (maxCharacters <= 0) {
    return chunkSegments(segments, maxSegments);
  }

  const chunks: SourceSegment[][] = [];
  let currentChunk: SourceSegment[] = [];
  let currentCharacters = 0;

  for (const segment of segments) {
    const segmentCharacters = segment.text.length;
    const wouldExceedSegmentLimit = currentChunk.length >= maxSegments;
    const wouldExceedCharacterLimit =
      currentChunk.length > 0 && currentCharacters + segmentCharacters > maxCharacters;

    if (wouldExceedSegmentLimit || wouldExceedCharacterLimit) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentCharacters = 0;
    }

    currentChunk.push(segment);
    currentCharacters += segmentCharacters;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function cacheTranslatedChunks(
  translated: Array<{ id: string; translatedText: string }>,
  pageByBlockId: Map<string, PdfTextPage>,
  cache: PdfPageTranslationCache,
): Promise<void> {
  logDebug('pdf translation cache write starting', {
    translatedCount: translated.length,
  });
  const translatedByPage = new Map<PdfTextPage, Array<{ id: string; translatedText: string }>>();
  for (const item of translated) {
    const page = pageByBlockId.get(item.id);
    if (!page) {
      continue;
    }

    const pageTranslated = translatedByPage.get(page) ?? [];
    pageTranslated.push(item);
    translatedByPage.set(page, pageTranslated);
  }

  await Promise.all(
    Array.from(translatedByPage, ([page, pageTranslated]) =>
      cache.setPageTranslations(page, pageTranslated),
    ),
  );
  logDebug('pdf translation cache write completed', {
    pageCount: translatedByPage.size,
    translatedCount: translated.length,
  });
}

export async function translatePdfSegments(
  segments: SourceSegment[],
  settings: ExtensionSettings,
) {
  logDebug('pdf provider translation dispatch', {
    providerId: settings.providerId,
    segmentCount: segments.length,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
  });
  const context = {
    providerId: settings.providerId,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    providerSettings: settings.providers[settings.providerId],
    contentKind: 'pdf-document' as const,
  };

  switch (settings.providerId) {
    case 'openai-compatible': {
      const provider = getProvider('openai-compatible');
      const providerSettings = context.providerSettings as OpenAICompatibleProviderSettings;
      const validation = provider.validateConfig(providerSettings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, providerSettings, postJson),
        PDF_TRANSLATION_BATCH_SIZE,
      );
    }
    case 'deepseek': {
      const provider = getProvider('deepseek');
      const providerSettings = context.providerSettings as DeepSeekProviderSettings;
      const validation = provider.validateConfig(providerSettings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, providerSettings, postJson),
        PDF_TRANSLATION_BATCH_SIZE,
      );
    }
    case 'traditional': {
      const provider = getProvider('traditional');
      const providerSettings = context.providerSettings as TraditionalProviderSettings;
      const validation = provider.validateConfig(providerSettings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, providerSettings, postJson),
        PDF_TRANSLATION_BATCH_SIZE,
      );
    }
  }
}
