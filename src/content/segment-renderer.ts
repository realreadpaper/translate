type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';

type TranslatedSegment = {
  id: string;
  translatedText: string;
};

export function applyTranslations(
  root: HTMLElement,
  translatedSegments: TranslatedSegment[],
) {
  translatedSegments.forEach((segment) => {
    const original = root.querySelector(`[data-segment-id="${segment.id}"]`);
    if (!original) {
      return;
    }

    const translated = document.createElement('div');
    translated.dataset.translationFor = segment.id;
    translated.textContent = segment.translatedText;
    original.insertAdjacentElement('afterend', translated);
  });
}

export function setDisplayMode(root: HTMLElement, mode: DisplayMode) {
  const originals = root.querySelectorAll('[data-segment-id]');
  originals.forEach((node) => {
    const element = node as HTMLElement;

    if (mode === 'translated-only') {
      element.dataset.originalHidden = 'true';
      element.style.display = 'none';
      return;
    }

    delete element.dataset.originalHidden;
    element.style.display = '';
  });
}

export function restoreOriginalContent(root: HTMLElement) {
  root.querySelectorAll('[data-translation-for]').forEach((node) => node.remove());
  setDisplayMode(root, 'bilingual');
}
