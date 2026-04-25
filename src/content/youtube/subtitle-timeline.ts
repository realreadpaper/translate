export type SubtitleCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export function findActiveCue(cues: SubtitleCue[], currentTimeSeconds: number) {
  const currentTimeMs = currentTimeSeconds * 1000;

  return cues.find((cue) => currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs) ?? null;
}
