import type { YoutubeSubtitleCue } from './subtitle-overlay';

type YoutubePrefetchLane = 'urgent' | 'prefetch' | 'background';

type CreateYoutubePrefetchBatchesOptions = {
  cues: YoutubeSubtitleCue[];
  nowMs: number;
  translatedIds: Set<string>;
  pendingIds: Set<string>;
  translatedTextBySourceText: Map<string, string>;
};

type YoutubePrefetchBatch = {
  lane: YoutubePrefetchLane;
  segments: Array<{ id: string; text: string }>;
};

const URGENT_LOOKAHEAD_MS = 30_000;
const PREFETCH_LOOKAHEAD_MS = 180_000;
const URGENT_BATCH_SIZE = 4;
const PREFETCH_BATCH_SIZE = 8;
const BACKGROUND_BATCH_SIZE = 8;

export function createYoutubePrefetchBatches({
  cues,
  nowMs,
  translatedIds,
  pendingIds,
  translatedTextBySourceText,
}: CreateYoutubePrefetchBatchesOptions): YoutubePrefetchBatch[] {
  const lanes: Record<YoutubePrefetchLane, Array<{ id: string; text: string }>> = {
    urgent: [],
    prefetch: [],
    background: [],
  };

  for (const cue of cues) {
    if (
      cue.endMs < nowMs - 500 ||
      translatedIds.has(cue.id) ||
      pendingIds.has(cue.id) ||
      translatedTextBySourceText.has(createSourceTextCacheKey(cue.text))
    ) {
      continue;
    }

    const segment = { id: cue.id, text: cue.text };
    if (cue.startMs <= nowMs + URGENT_LOOKAHEAD_MS) {
      lanes.urgent.push(segment);
    } else if (cue.startMs <= nowMs + PREFETCH_LOOKAHEAD_MS) {
      lanes.prefetch.push(segment);
    } else {
      lanes.background.push(segment);
    }
  }

  return [
    { lane: 'urgent' as const, segments: lanes.urgent.slice(0, URGENT_BATCH_SIZE) },
    { lane: 'prefetch' as const, segments: lanes.prefetch.slice(0, PREFETCH_BATCH_SIZE) },
    { lane: 'background' as const, segments: lanes.background.slice(0, BACKGROUND_BATCH_SIZE) },
  ].filter((batch) => batch.segments.length > 0);
}

export function createSourceTextCacheKey(sourceText: string): string {
  return sourceText.replace(/\s+/g, ' ').trim().toLowerCase();
}
