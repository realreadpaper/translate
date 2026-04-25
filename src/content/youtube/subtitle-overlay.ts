import type { DisplayMode, SubtitleDisplayStyle } from '../../shared/types';
import type { SubtitleCue } from './subtitle-timeline';

export function mountYoutubeSubtitleOverlay(
  root: HTMLElement,
  options: {
    displayStyle: SubtitleDisplayStyle;
    getOriginalCue: () => SubtitleCue | null;
    getTranslatedText: (cueId: string) => string | null;
    getDisplayMode: () => DisplayMode;
  },
) {
  const host = document.createElement('div');
  host.dataset.youtubeSubtitleOverlay = options.displayStyle;
  root.appendChild(host);

  return {
    render() {
      const cue = options.getOriginalCue();
      if (!cue) {
        host.textContent = '';
        return;
      }

      const translatedText = options.getTranslatedText(cue.id);
      const mode = options.getDisplayMode();

      host.textContent =
        mode === 'original-only'
          ? cue.text
          : mode === 'translated-only'
            ? translatedText ?? ''
            : `${cue.text}\n${translatedText ?? ''}`;
    },
    renderPrompt(message: string) {
      host.textContent = message;
    },
    unmount() {
      host.remove();
    },
  };
}
