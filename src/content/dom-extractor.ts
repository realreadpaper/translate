const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote'));

  return elements
    .filter((element) => !BLOCKED_TAGS.has(element.tagName))
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean)
    .map((text, index) => ({
      id: `seg-${index}`,
      text,
    }));
}
