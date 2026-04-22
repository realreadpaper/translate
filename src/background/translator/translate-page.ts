import { chunkSegments } from './batch';

type SourceSegment = { id: string; text: string };
type TranslatedSegment = { id: string; translatedText: string };

type TranslateContext = {
  providerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerSettings: unknown;
};

type TranslateBatchParams = {
  segments: SourceSegment[];
  sourceLanguage: string;
  targetLanguage: string;
};

type TranslateBatchResult =
  | { ok: true; segments: TranslatedSegment[] }
  | { ok: false; message: string };

type TranslateBatch = (params: TranslateBatchParams) => Promise<TranslateBatchResult>;

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

  for (const batch of batches) {
    let result: TranslateBatchResult;
    try {
      result = await translateBatch({
        segments: batch,
        sourceLanguage: context.sourceLanguage,
        targetLanguage: context.targetLanguage,
      });
    } catch (error) {
      failedBatches.push({
        segmentIds: batch.map((segment) => segment.id),
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (result.ok) {
      translated.push(...result.segments);
      continue;
    }

    failedBatches.push({
      segmentIds: batch.map((segment) => segment.id),
      message: result.message,
    });
  }

  return {
    status: failedBatches.length > 0 ? 'partial-success' : 'success',
    translated,
    failedBatches,
  };
}
