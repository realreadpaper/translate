const BLOCKED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'SVG',
  'CANVAS',
]);
const BLOCKED_SELECTOR = [
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'textarea',
  'input',
  'select',
  'option',
  'svg',
  'canvas',
].join(', ');
const COMMON_CHROME_SELECTOR = [
  'header',
  'footer',
  'nav',
  'aside',
  'button',
  'label',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="navigation"]',
  '[role="search"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="tablist"]',
  '[role="toolbar"]',
  '[role="button"]',
].join(', ');
const GENERIC_BLOCK_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'blockquote',
  'div',
  'section',
  'article',
  'td',
  'th',
  'figcaption',
  'dt',
  'dd',
].join(', ');
const X_CHROME_SELECTOR = [
  '[data-testid="User-Name"]',
  '[data-testid="socialContext"]',
  '[data-testid="caret"]',
  '[data-testid="reply"]',
  '[data-testid="retweet"]',
  '[data-testid="like"]',
  '[data-testid="bookmark"]',
  '[data-testid="share"]',
  '[role="group"][aria-label]',
  '[aria-label*="Reply"]',
  '[aria-label*="Repost"]',
  '[aria-label*="Like"]',
].join(', ');
const X_BLOCK_SELECTOR = [
  '[data-testid="tweetText"]',
  'article[data-testid="tweet"] [lang]',
].join(', ');
const X_CONTAINER_SELECTOR = 'article[data-testid="tweet"]';
const REDDIT_CONTAINER_SELECTOR = [
  'shreddit-post',
  'shreddit-comment',
  '[data-testid="post-container"]',
  'article[data-testid*="post"]',
].join(', ');
const REDDIT_CHROME_SELECTOR = [
  '[slot="recommendation-context"]',
  '[slot="post-meta"]',
  '[slot="credit-bar"]',
  '[slot="actionRow"]',
  '[slot="commentMeta"]',
  '[data-testid="post-meta"]',
  '[data-testid="post-credit-bar"]',
  '[data-testid="post-info"]',
].join(', ');
const REDDIT_BLOCK_SELECTOR = [
  'shreddit-post [slot="title"]',
  'shreddit-post [slot="text-body"]',
  'shreddit-comment [slot="comment"]',
  '[data-testid="post-title"]',
  '[data-testid="post-content"] h1',
  '[data-testid="post-content"] h2',
  '[data-testid="post-content"] h3',
  '[data-testid="comment"]',
].join(', ');
const SPECIAL_BLOCK_SELECTOR = [X_BLOCK_SELECTOR, REDDIT_BLOCK_SELECTOR].join(', ');
const SITE_CONTAINER_SELECTOR = [
  X_CONTAINER_SELECTOR,
  REDDIT_CONTAINER_SELECTOR,
].join(', ');

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = getTranslatableElements(root);
  const usedSegmentIds = new Set(
    Array.from(root.querySelectorAll('[data-segment-id]'))
      .map((element) => (element as HTMLElement).dataset.segmentId)
      .filter((id): id is string => Boolean(id)),
  );
  let nextSegmentIndex = getNextSegmentIndex(usedSegmentIds);

  return elements
    .flatMap((element) => {
      const text = getSegmentText(element, root);
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

function getTranslatableElements(root: HTMLElement): HTMLElement[] {
  const elements = new Set<HTMLElement>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return findSegmentHost(node, root) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  while (walker.nextNode()) {
    const host = findSegmentHost(walker.currentNode, root);
    if (host) {
      elements.add(host);
    }
  }

  return Array.from(elements).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

export function containsTranslatableText(node: Node, root: HTMLElement): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(findSegmentHost(node, root));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      return findSegmentHost(textNode, root) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  return Boolean(walker.nextNode());
}

function findSegmentHost(node: Node, root: HTMLElement): HTMLElement | null {
  const parent = getElementForNode(node);
  if (!parent || !root.contains(parent) || !hasReadableText(node)) {
    return null;
  }

  if (
    isInsideIgnoredContent(parent) ||
    isInsideBlockedContent(parent) ||
    isInsideCommonChrome(parent) ||
    isHidden(parent)
  ) {
    return null;
  }

  const specialHost = parent.closest(SPECIAL_BLOCK_SELECTOR);
  if (specialHost && root.contains(specialHost) && isEligibleHost(specialHost as HTMLElement)) {
    return specialHost as HTMLElement;
  }

  if (parent.closest(SITE_CONTAINER_SELECTOR)) {
    return null;
  }

  let current: HTMLElement | null = parent;
  while (current && root.contains(current)) {
    if (current === document.body || current === document.documentElement) {
      return null;
    }

    if (!isEligibleHost(current)) {
      return null;
    }

    if (isGenericSegmentHost(current)) {
      return current;
    }

    if (current === root) {
      return null;
    }

    current = current.parentElement;
  }

  return null;
}

function getSegmentText(element: HTMLElement, root: HTMLElement): string {
  let text = '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return findSegmentHost(node, root) === element
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  while (walker.nextNode()) {
    text = appendNormalizedText(text, walker.currentNode.textContent ?? '');
  }

  return text;
}

function appendNormalizedText(current: string, nextText: string): string {
  const next = normalizeSegmentText(nextText);
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (/^[,.;:!?，。！？；：、)]/.test(next) || /[(（]$/.test(current)) {
    return `${current}${next}`;
  }

  return `${current} ${next}`;
}

function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hasReadableText(node: Node): boolean {
  return Boolean(normalizeSegmentText(node.textContent ?? ''));
}

function getElementForNode(node: Node): HTMLElement | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as HTMLElement;
  }

  return node.parentElement;
}

function isEligibleHost(element: HTMLElement): boolean {
  return (
    !isInsideIgnoredContent(element) &&
    !isInsideBlockedContent(element) &&
    !isInsideCommonChrome(element) &&
    !element.closest(X_CHROME_SELECTOR) &&
    !element.closest(REDDIT_CHROME_SELECTOR) &&
    !isHidden(element)
  );
}

function isInsideIgnoredContent(element: HTMLElement): boolean {
  return Boolean(element.closest('[data-immersive-ignore="true"]'));
}

function isInsideBlockedContent(element: HTMLElement): boolean {
  return BLOCKED_TAGS.has(element.tagName) || Boolean(element.closest(BLOCKED_SELECTOR));
}

function isInsideCommonChrome(element: HTMLElement): boolean {
  return Boolean(element.closest(COMMON_CHROME_SELECTOR));
}

function isHidden(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse'
  ) {
    return true;
  }

  return element.parentElement ? isHidden(element.parentElement) : false;
}

function isGenericSegmentHost(element: HTMLElement): boolean {
  if (element.matches(GENERIC_BLOCK_SELECTOR)) {
    return true;
  }

  const role = element.getAttribute('role');
  if (role && ['article', 'heading', 'listitem', 'paragraph'].includes(role)) {
    return true;
  }

  const display = window.getComputedStyle(element).display;
  return ['block', 'flow-root', 'list-item', 'table-cell', 'flex', 'grid'].includes(display);
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
