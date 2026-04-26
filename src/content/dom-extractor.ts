const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);
const BLOCKED_SELECTOR = 'script, style, code, pre, textarea, input';
const TRANSLATABLE_BLOCK_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'p',
  'li',
  'blockquote',
  '[data-testid="tweetText"]',
  'shreddit-post [slot="title"]',
  'shreddit-post [slot="text-body"]',
  'shreddit-comment [slot="comment"]',
  '[data-testid="post-title"]',
  '[data-testid="post-content"]',
  '[data-testid="comment"]',
].join(', ');

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = Array.from(root.querySelectorAll(TRANSLATABLE_BLOCK_SELECTOR));
  let index = 0;

  return elements
    .filter((element) => !element.closest('[data-immersive-ignore="true"]'))
    .filter((element) => !BLOCKED_TAGS.has(element.tagName))
    .filter((element) => !element.parentElement?.closest(TRANSLATABLE_BLOCK_SELECTOR))
    .flatMap((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(BLOCKED_SELECTOR).forEach((blocked) => blocked.remove());
      const text = normalizeSegmentText(clone.textContent ?? '');
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

function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
