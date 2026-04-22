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

    const sibling = original.nextElementSibling as HTMLElement | null;
    const existingAdjacent =
      sibling?.dataset.translationFor === segment.id ? sibling : null;
    const existingAnywhere = root.querySelector(
      `[data-translation-for="${segment.id}"]`,
    ) as HTMLElement | null;

    const translated = existingAdjacent ?? existingAnywhere ?? document.createElement('div');
    translated.dataset.translationFor = segment.id;
    translated.textContent = segment.translatedText;
    if (translated !== existingAdjacent) {
      original.insertAdjacentElement('afterend', translated);
    }
  });
}

export function setDisplayMode(root: HTMLElement, mode: DisplayMode) {
  const originals = root.querySelectorAll('[data-segment-id]');
  const translations = root.querySelectorAll('[data-translation-for]');

  originals.forEach((node) => {
    const element = node as HTMLElement;

    if (mode === 'translated-only') {
      if (element.dataset.originalDisplay === undefined) {
        element.dataset.originalDisplay = element.style.display;
      }
      element.dataset.originalHidden = 'true';
      element.style.display = 'none';
      return;
    }

    delete element.dataset.originalHidden;
    if (element.dataset.originalDisplay !== undefined) {
      element.style.display = element.dataset.originalDisplay;
      delete element.dataset.originalDisplay;
    }
  });

  translations.forEach((node) => {
    const element = node as HTMLElement;
    if (mode === 'original-only') {
      element.style.display = 'none';
      return;
    }

    element.style.display = '';
  });
}

export function restoreOriginalContent(root: HTMLElement) {
  root.querySelectorAll('[data-translation-for]').forEach((node) => node.remove());
  setDisplayMode(root, 'bilingual');
}
