import type { SubtitleCue } from './subtitle-timeline';

export async function collectYoutubeSubtitleCues(root: Document): Promise<SubtitleCue[]> {
  const nodes = Array.from(root.querySelectorAll('[data-start-ms][data-end-ms]'));

  return nodes
    .map((node, index) => ({
      id: `cue-${index}`,
      startMs: Number((node as HTMLElement).dataset.startMs),
      endMs: Number((node as HTMLElement).dataset.endMs),
      text: node.textContent?.trim() ?? '',
    }))
    .filter((cue) => cue.text);
}
