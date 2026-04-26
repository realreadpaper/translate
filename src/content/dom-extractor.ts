const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);
const BLOCKED_SELECTOR = 'script, style, code, pre, textarea, input';

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote'));
  let index = 0;

  return elements
    .filter((element) => !element.closest('[data-immersive-ignore="true"]'))
    .filter((element) => !BLOCKED_TAGS.has(element.tagName))
    .flatMap((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(BLOCKED_SELECTOR).forEach((blocked) => blocked.remove());
      const text = clone.textContent?.trim() ?? '';
      if (!text) {
        delete (element as HTMLElement).dataset.segmentId;
        return [];
      }

      const id = `seg-${index}`;
      index += 1;
      (element as HTMLElement).dataset.segmentId = id;
      return [{ id, text }];
    });
}
