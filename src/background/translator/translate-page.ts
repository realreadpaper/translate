import { chunkSegments } from './batch';
import { logDebug } from '../../shared/debug';

type SourceSegment = { id: string; text: string };
type TranslatedSegment = { id: string; translatedText: string };

type TranslateContext = {
  providerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerSettings: unknown;
  contentKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
};

type TranslateBatchParams = {
  segments: SourceSegment[];
  sourceLanguage: string;
  targetLanguage: string;
  contentKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
};

type TranslateBatchResult =
  | { ok: true; segments: TranslatedSegment[] }
  | { ok: false; message: string };

type TranslateBatch = (params: TranslateBatchParams) => Promise<TranslateBatchResult>;
const MAX_MALFORMED_BATCH_ATTEMPTS = 2;
const DEFAULT_SOURCE_LANGUAGE = 'en';
const DEFAULT_TARGET_LANGUAGE = 'zh-CN';

export async function translatePageSegments(
  segments: SourceSegment[],
  context: TranslateContext,
  translateBatch: TranslateBatch,
  batchSize: number,
): Promise<{
  status: 'success' | 'partial-success';
  translated: TranslatedSegment[];
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
}> {
  const batches = chunkSegments(segments, batchSize);
  const translated: TranslatedSegment[] = [];
  const failedBatches: Array<{ segmentIds: string[]; message: string }> = [];
  logDebug('translator batches created', {
    providerId: context.providerId,
    contentKind: context.contentKind ?? 'html-page',
    segmentCount: segments.length,
    batchCount: batches.length,
    batchSize,
  });

  for (const [batchIndex, batch] of batches.entries()) {
    let completed = false;

    for (let attempt = 1; attempt <= MAX_MALFORMED_BATCH_ATTEMPTS; attempt += 1) {
      let result: TranslateBatchResult;
      const resolvedLanguages = resolveBatchLanguages(
        batch,
        context.sourceLanguage,
        context.targetLanguage,
      );
      logDebug('translator batch starting', {
        batchIndex,
        attempt,
        maxAttempts: MAX_MALFORMED_BATCH_ATTEMPTS,
        segmentCount: batch.length,
        firstSegmentId: batch[0]?.id,
        lastSegmentId: batch.at(-1)?.id,
        sourceLanguage: resolvedLanguages.sourceLanguage,
        targetLanguage: resolvedLanguages.targetLanguage,
      });
      try {
        result = await translateBatch({
          segments: batch,
          sourceLanguage: resolvedLanguages.sourceLanguage,
          targetLanguage: resolvedLanguages.targetLanguage,
          contentKind: context.contentKind,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isMalformedTranslationError(message) && attempt < MAX_MALFORMED_BATCH_ATTEMPTS) {
          logDebug('translator batch retrying after thrown malformed result', {
            batchIndex,
            attempt,
            message,
          });
          continue;
        }

        failedBatches.push({
          segmentIds: batch.map((segment) => segment.id),
          message,
        });
        logDebug('translator batch threw', {
          batchIndex,
          attempt,
          message,
        });
        completed = true;
        break;
      }

      if (result.ok) {
        if (!Array.isArray(result.segments)) {
          const message = 'Provider returned malformed translated segments.';
          if (attempt < MAX_MALFORMED_BATCH_ATTEMPTS) {
            logDebug('translator batch retrying malformed result', {
              batchIndex,
              attempt,
              message,
            });
            continue;
          }

          logDebug('translator batch malformed result', { batchIndex, attempt });
          failedBatches.push({
            segmentIds: batch.map((segment) => segment.id),
            message,
          });
          completed = true;
          break;
        }

        logDebug('translator batch completed', {
          batchIndex,
          attempt,
          translatedCount: result.segments.length,
        });
        translated.push(...result.segments);
        completed = true;
        break;
      }

      if (isMalformedTranslationError(result.message) && attempt < MAX_MALFORMED_BATCH_ATTEMPTS) {
        logDebug('translator batch retrying failed malformed result', {
          batchIndex,
          attempt,
          message: result.message,
        });
        continue;
      }

      logDebug('translator batch failed', {
        batchIndex,
        attempt,
        message: result.message,
      });
      failedBatches.push({
        segmentIds: batch.map((segment) => segment.id),
        message: result.message,
      });
      completed = true;
      break;
    }

    if (!completed) {
      failedBatches.push({
        segmentIds: batch.map((segment) => segment.id),
        message: 'Provider returned malformed translated segments.',
      });
    }
  }

  logDebug('translator finished', {
    status: failedBatches.length > 0 ? 'partial-success' : 'success',
    translatedCount: translated.length,
    failedBatchCount: failedBatches.length,
  });
  return {
    status: failedBatches.length > 0 ? 'partial-success' : 'success',
    translated,
    failedBatches,
  };
}

function isMalformedTranslationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('malformed translated segments') ||
    normalized.includes('unexpected token') ||
    message.includes('格式不正确的翻译结果') ||
    message.includes('无法解析的翻译结果')
  );
}

function resolveBatchLanguages(
  segments: SourceSegment[],
  sourceLanguage: string,
  targetLanguage: string,
): { sourceLanguage: string; targetLanguage: string } {
  const normalizedSource = normalizeLanguageCode(sourceLanguage);
  const normalizedTarget = normalizeLanguageCode(targetLanguage) || DEFAULT_TARGET_LANGUAGE;

  if (normalizedSource && normalizedSource !== 'auto') {
    return {
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
    };
  }

  const detectedSource = detectDominantLanguage(segments) ?? DEFAULT_SOURCE_LANGUAGE;
  const resolvedTarget =
    areSameLanguage(detectedSource, normalizedTarget)
      ? getFallbackTargetLanguage(detectedSource)
      : normalizedTarget;

  return {
    sourceLanguage: detectedSource,
    targetLanguage: resolvedTarget,
  };
}

function detectDominantLanguage(segments: SourceSegment[]): string | null {
  const text = segments.map((segment) => segment.text).join('\n');
  let chineseCount = 0;
  let latinCount = 0;

  for (const char of text) {
    if (/[\u3400-\u9fff]/u.test(char)) {
      chineseCount += 1;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      latinCount += 1;
    }
  }

  if (chineseCount === 0 && latinCount === 0) {
    return null;
  }

  if (chineseCount >= Math.max(2, latinCount * 0.3)) {
    return 'zh-CN';
  }

  return 'en';
}

function normalizeLanguageCode(language: string): string {
  return language.trim();
}

function areSameLanguage(firstLanguage: string, secondLanguage: string): boolean {
  return getLanguageFamily(firstLanguage) === getLanguageFamily(secondLanguage);
}

function getLanguageFamily(language: string): string {
  return language.trim().toLowerCase().split('-')[0] || language;
}

function getFallbackTargetLanguage(sourceLanguage: string): string {
  return getLanguageFamily(sourceLanguage) === 'zh' ? 'en' : DEFAULT_TARGET_LANGUAGE;
}
