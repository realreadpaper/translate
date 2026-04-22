const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);
const BLOCKED_SELECTOR = 'script, style, code, pre, textarea, input';

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote'));

  return elements
    .filter((element) => !BLOCKED_TAGS.has(element.tagName))
    .map((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(BLOCKED_SELECTOR).forEach((blocked) => blocked.remove());
      return clone.textContent?.trim() ?? '';
    })
    .filter(Boolean)
    .map((text, index) => ({
      id: `seg-${index}`,
      text,
    }));
}
