import type {
  PageTranslationFailedMessage,
  PageTranslationFinishedMessage,
  StartPageTranslationMessage,
  StartTranslationJobMessage,
  TranslationJobRedirectedMessage,
} from '../shared/messages';
import { logDebug } from '../shared/debug';
import { cleanAds } from './ad-cleaner';
import { containsTranslatableText, extractSegments } from './dom-extractor';

type RuntimeMessage = StartPageTranslationMessage | StartTranslationJobMessage;
type TranslationResponse =
  | PageTranslationFinishedMessage
  | PageTranslationFailedMessage
  | TranslationJobRedirectedMessage;
type SourceSegment = { id: string; text: string };

type FloatingBallDependencies = {
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void | TranslationResponse>;
};

type FloatingBallController = {
  markTranslated: () => void;
  startTranslation: () => Promise<void>;
  enableIncrementalTranslation: () => void;
};

const FLOATING_BALL_STYLE_ID = 'immersive-ai-translate-floating-ball-style';
const VIEWPORT_PRELOAD_PX = 120;
const VIEWPORT_SEGMENT_LIMIT = 12;
const SCROLL_DEBOUNCE_MS = 120;
const IGNORED_MUTATION_SELECTOR =
  '[data-floating-ball="true"], [data-translation-for], [data-immersive-ignore="true"]';

export function mountFloatingBall(
  root: HTMLElement,
  { sendRuntimeMessage }: FloatingBallDependencies,
): FloatingBallController {
  ensureFloatingBallStyles();

  const host = document.createElement('div');
  host.dataset.floatingBall = 'true';
  host.dataset.immersiveIgnore = 'true';
  host.innerHTML = `
    <div class="floating-ball">
      <button aria-label="翻译当前页面" class="floating-ball__trigger" data-floating-ball-trigger type="button">译</button>
    </div>
  `;

  root.appendChild(host);

  const trigger = host.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
  let translated = false;
  let isTranslating = false;
  let viewportModeStarted = false;
  let scrollTimer: number | undefined;
  let mutationTimer: number | undefined;
  let needsViewportRescanAfterCurrent = false;
  const completedSegmentFingerprints = new Map<string, string>();
  const pendingSegmentFingerprints = new Map<string, string>();

  function setTriggerState(
    nextState: 'idle' | 'loading' | 'translated' | 'partial-success' | 'error',
    title?: string,
  ) {
    trigger.dataset.state = nextState;
    if (title) {
      trigger.title = title;
      trigger.setAttribute('aria-label', title);
      return;
    }

    const fallbackTitle = nextState === 'translated' ? '当前页面已翻译' : '翻译当前页面';
    trigger.title = fallbackTitle;
    trigger.setAttribute('aria-label', fallbackTitle);
  }

  function collectNextViewportSegments(): SourceSegment[] {
    cleanAds(root);
    const segments = extractSegments(root);
    const nextSegments = segments.filter((segment) => {
      const fingerprint = createSegmentFingerprint(segment);
      if (
        completedSegmentFingerprints.get(segment.id) === fingerprint ||
        pendingSegmentFingerprints.get(segment.id) === fingerprint
      ) {
        return false;
      }

      const element = root.querySelector(`[data-segment-id="${segment.id}"]`);
      if (!element) {
        return false;
      }

      const existingTranslation = root.querySelector(
        `[data-translation-for="${segment.id}"]`,
      ) as HTMLElement | null;
      if (
        existingTranslation &&
        (!existingTranslation.dataset.sourceText ||
          existingTranslation.dataset.sourceText === fingerprint)
      ) {
        completedSegmentFingerprints.set(segment.id, fingerprint);
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight + VIEWPORT_PRELOAD_PX;
    });

    return nextSegments.slice(0, VIEWPORT_SEGMENT_LIMIT);
  }

  async function startTranslation(segments = collectNextViewportSegments()) {
    let shouldContinueViewportScan = false;
    if (!host.isConnected) {
      return;
    }

    if (isTranslating) {
      if (segments.length > 0) {
        needsViewportRescanAfterCurrent = true;
        logDebug('floating ball queued viewport rescan while translation is running', {
          segmentCount: segments.length,
        });
      } else {
        logDebug('floating ball ignored duplicate translation click');
      }
      return;
    }

    const message: StartPageTranslationMessage | StartTranslationJobMessage = createStartMessage(
      segments,
    );

    if (message.type === 'START_PAGE_TRANSLATION') {
      segments.forEach((segment) => {
        pendingSegmentFingerprints.set(segment.id, createSegmentFingerprint(segment));
      });
    }
    logDebug('floating ball start message prepared', {
      messageType: message.type,
      targetKind: message.type === 'START_TRANSLATION_JOB' ? message.targetKind : 'html-page',
      segmentCount: segments.length,
    });
    isTranslating = true;
    trigger.disabled = true;
    setTriggerState('loading', '正在翻译当前页面...');

    try {
      const response = (await sendRuntimeMessage(message)) as TranslationResponse;

      if (response.type === 'PAGE_TRANSLATION_FAILED') {
        throw new Error(response.message);
      }

      if (response.type === 'TRANSLATION_JOB_REDIRECTED') {
        translated = true;
        pendingSegmentFingerprints.clear();
        setTriggerState('translated', `已打开 PDF 翻译工作台：${response.target.displayName}`);
        return;
      }

      translated = true;
      response.translated.forEach((segment) => {
        const pendingFingerprint = pendingSegmentFingerprints.get(segment.id);
        if (pendingFingerprint) {
          completedSegmentFingerprints.set(segment.id, pendingFingerprint);
        }
        pendingSegmentFingerprints.delete(segment.id);
      });
      response.failedBatches.forEach((batch) => {
        batch.segmentIds.forEach((id) => pendingSegmentFingerprints.delete(id));
      });

      if (response.status === 'partial-success') {
        setTriggerState(
          'partial-success',
          `已完成 ${response.translated.length} 段翻译，${response.failedBatches.length} 个批次失败`,
        );
      } else {
        setTriggerState('translated', `已完成 ${response.translated.length} 段翻译`);
      }
      shouldContinueViewportScan = message.type === 'START_PAGE_TRANSLATION';
    } catch (error) {
      translated = false;
      segments.forEach((segment) => pendingSegmentFingerprints.delete(segment.id));
      logDebug('floating ball translation failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      setTriggerState(
        'error',
        `翻译失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      isTranslating = false;
      trigger.disabled = false;
      if (
        needsViewportRescanAfterCurrent &&
        viewportModeStarted &&
        host.isConnected &&
        shouldUseViewportIncrementalTranslation()
      ) {
        needsViewportRescanAfterCurrent = false;
        logDebug('floating ball retrying queued viewport scan');
        scheduleViewportTranslation();
      } else if (
        shouldContinueViewportScan &&
        viewportModeStarted &&
        host.isConnected &&
        shouldUseViewportIncrementalTranslation()
      ) {
        scheduleViewportTranslation();
      }
    }
  }

  function scheduleViewportTranslation() {
    if (!viewportModeStarted || !host.isConnected || !shouldUseViewportIncrementalTranslation()) {
      return;
    }

    if (scrollTimer !== undefined) {
      window.clearTimeout(scrollTimer);
    }

    scrollTimer = window.setTimeout(() => {
      const segments = collectNextViewportSegments();
      if (segments.length === 0) {
        return;
      }

      void startTranslation(segments);
    }, SCROLL_DEBOUNCE_MS);
  }

  function scheduleMutationViewportTranslation() {
    if (!viewportModeStarted || !host.isConnected || !shouldUseViewportIncrementalTranslation()) {
      return;
    }

    if (mutationTimer !== undefined) {
      window.clearTimeout(mutationTimer);
    }

    mutationTimer = window.setTimeout(() => {
      const segments = collectNextViewportSegments();
      if (segments.length === 0) {
        return;
      }

      logDebug('floating ball scanned mutated content', {
        segmentCount: segments.length,
      });
      void startTranslation(segments);
    }, SCROLL_DEBOUNCE_MS);
  }

  const contentObserver = new MutationObserver((mutations) => {
    if (!viewportModeStarted || !host.isConnected || !shouldUseViewportIncrementalTranslation()) {
      return;
    }

    if (!hasMeaningfulContentMutation(mutations, root)) {
      return;
    }

    logDebug('floating ball detected page content mutation', {
      mutationCount: mutations.length,
    });
    scheduleMutationViewportTranslation();
  });

  trigger.addEventListener('click', () => {
    viewportModeStarted = true;
    void startTranslation();
  });
  window.addEventListener('scroll', scheduleViewportTranslation, { passive: true });
  window.addEventListener('focus', scheduleViewportTranslation);
  window.addEventListener('resize', scheduleViewportTranslation);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleViewportTranslation();
    }
  });
  root.addEventListener('focusin', scheduleViewportTranslation);
  contentObserver.observe(root, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'class', 'data-testid', 'dir', 'hidden', 'lang', 'style'],
    childList: true,
    subtree: true,
    characterData: true,
  });

  setTriggerState('idle');

  return {
    markTranslated() {
      translated = true;
      setTriggerState('translated', translated ? '当前页面已翻译' : '翻译当前页面');
    },
    startTranslation,
    enableIncrementalTranslation() {
      viewportModeStarted = true;
      scheduleViewportTranslation();
    },
  };
}

function createStartMessage(segments: SourceSegment[]): StartPageTranslationMessage | StartTranslationJobMessage {
  if (isYoutubeWatchPage()) {
    logDebug('floating ball route selected', { targetKind: 'youtube-subtitles' });
    return {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
    };
  }

  if (isPdfPage()) {
    logDebug('floating ball route selected', { targetKind: 'pdf-document' });
    return {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'pdf-document',
    };
  }

  logDebug('floating ball route selected', {
    targetKind: 'html-page',
    segmentCount: segments.length,
  });
  if (segments.length > 0) {
    return {
      type: 'START_PAGE_TRANSLATION',
      segments,
    };
  }

  return {
    type: 'START_PAGE_TRANSLATION',
  };
}

function isYoutubeWatchPage(): boolean {
  return (
    (window.location.hostname === 'www.youtube.com' || window.location.hostname === 'youtube.com') &&
    window.location.pathname === '/watch'
  );
}

function isPdfPage(): boolean {
  const { href, pathname, search } = window.location;
  if (/\.pdf(?:$|[?#])/i.test(href) || pathname.startsWith('/pdf/')) {
    return true;
  }

  const sourceUrl = new URLSearchParams(search).get('src') ?? '';
  return /\.pdf(?:$|[?#])/i.test(sourceUrl);
}

function shouldUseViewportIncrementalTranslation(): boolean {
  return !isYoutubeWatchPage() && !isPdfPage();
}

function createSegmentFingerprint(segment: SourceSegment): string {
  return segment.text;
}

function hasMeaningfulContentMutation(mutations: MutationRecord[], root: HTMLElement): boolean {
  return mutations.some((mutation) => {
    if (isIgnoredMutationNode(mutation.target)) {
      return false;
    }

    if (mutation.type === 'characterData') {
      return isTranslatableMutationNode(mutation.target, root);
    }

    if (mutation.type === 'attributes') {
      return isTranslatableMutationNode(mutation.target, root);
    }

    if (mutation.type !== 'childList') {
      return false;
    }

    return Array.from(mutation.addedNodes).some((node) => isTranslatableMutationNode(node, root));
  });
}

function isIgnoredMutationNode(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentNode?.nodeType === Node.ELEMENT_NODE
        ? (node.parentNode as Element)
        : null;
  return Boolean(element?.closest(IGNORED_MUTATION_SELECTOR));
}

function isTranslatableMutationNode(node: Node, root: HTMLElement): boolean {
  if (isIgnoredMutationNode(node)) {
    return false;
  }

  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentNode?.nodeType === Node.ELEMENT_NODE
        ? (node.parentNode as Element)
        : null;
  if (!element) {
    return false;
  }

  return containsTranslatableText(node, root);
}

function ensureFloatingBallStyles() {
  if (document.getElementById(FLOATING_BALL_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = FLOATING_BALL_STYLE_ID;
  style.textContent = `
    [data-floating-ball="true"] {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483646;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
    }

    .floating-ball {
      display: flex;
      align-items: flex-end;
    }

    .floating-ball__trigger {
      width: 54px;
      height: 54px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #0f766e 0%, #155e75 100%);
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      box-shadow: 0 18px 36px rgba(15, 118, 110, 0.26);
      cursor: pointer;
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        background 160ms ease;
    }

    .floating-ball__trigger:hover {
      transform: translateY(-1px);
      box-shadow: 0 20px 40px rgba(15, 118, 110, 0.28);
    }

    .floating-ball__trigger:disabled {
      cursor: wait;
      opacity: 0.78;
    }

    .floating-ball__trigger[data-state="translated"] {
      background: linear-gradient(135deg, #3f7a5f 0%, #2f6d68 100%);
    }

    .floating-ball__trigger[data-state="partial-success"] {
      background: linear-gradient(135deg, #c68a2b 0%, #b7791f 100%);
    }

    .floating-ball__trigger[data-state="error"] {
      background: linear-gradient(135deg, #b45309 0%, #9a3412 100%);
    }

    .floating-ball__trigger[data-state="loading"] {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
    }
  `;

  document.head.appendChild(style);
}
