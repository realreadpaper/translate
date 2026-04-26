const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);
const BLOCKED_SELECTOR = 'script, style, code, pre, textarea, input';
export const TRANSLATABLE_BLOCK_SELECTOR = [
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
  const usedSegmentIds = new Set(
    elements
      .map((element) => (element as HTMLElement).dataset.segmentId)
      .filter((id): id is string => Boolean(id)),
  );
  let nextSegmentIndex = getNextSegmentIndex(usedSegmentIds);

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

      const id = getStableSegmentId(element as HTMLElement, usedSegmentIds, () => {
        let nextId = `seg-${nextSegmentIndex}`;
        while (usedSegmentIds.has(nextId)) {
          nextSegmentIndex += 1;
          nextId = `seg-${nextSegmentIndex}`;
        }
        nextSegmentIndex += 1;
        return nextId;
      });
      return [{ id, text }];
    });
}

function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getStableSegmentId(
  element: HTMLElement,
  usedSegmentIds: Set<string>,
  createId: () => string,
): string {
  const existingId = element.dataset.segmentId;
  if (existingId) {
    return existingId;
  }

  const id = createId();
  usedSegmentIds.add(id);
  element.dataset.segmentId = id;
  return id;
}

function getNextSegmentIndex(usedSegmentIds: Set<string>): number {
  let maxSegmentIndex = -1;
  usedSegmentIds.forEach((id) => {
    const match = /^seg-(\d+)$/.exec(id);
    if (!match) {
      return;
    }

    maxSegmentIndex = Math.max(maxSegmentIndex, Number(match[1]));
  });

  return maxSegmentIndex + 1;
}
