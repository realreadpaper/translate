import type {
  PageTranslationFailedMessage,
  PageTranslationFinishedMessage,
  StartPageTranslationMessage,
} from '../shared/messages';
import { logDebug } from '../shared/debug';
import { cleanAds } from './ad-cleaner';
import { containsTranslatableText, extractSegments } from './dom-extractor';

type RuntimeMessage = StartPageTranslationMessage;
type TranslationResponse = PageTranslationFinishedMessage | PageTranslationFailedMessage;
type SourceSegment = { id: string; text: string };

type FloatingBallDependencies = {
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void | TranslationResponse>;
};

type FloatingBallController = {
  markTranslated: () => void;
  startTranslation: () => Promise<void>;
};

const FLOATING_BALL_STYLE_ID = 'immersive-ai-translate-floating-ball-style';
const VIEWPORT_PRELOAD_PX = 120;
const VIEWPORT_SEGMENT_LIMIT = 6;
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

      const rect = element.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight + VIEWPORT_PRELOAD_PX;
    });

    return nextSegments.slice(0, VIEWPORT_SEGMENT_LIMIT);
  }

  async function startTranslation(segments = collectNextViewportSegments()) {
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

    const message: StartPageTranslationMessage =
      segments.length > 0
        ? {
            type: 'START_PAGE_TRANSLATION',
            segments,
          }
        : {
            type: 'START_PAGE_TRANSLATION',
          };

    segments.forEach((segment) => {
      pendingSegmentFingerprints.set(segment.id, createSegmentFingerprint(segment));
    });
    logDebug('floating ball starting html-page translation', {
      segmentCount: segments.length,
    });
    isTranslating = true;
    trigger.disabled = true;
    setTriggerState('loading', '正在翻译当前页面...');

    try {
      const response = (await sendRuntimeMessage(message)) as TranslationResponse;
      logDebug('floating ball received translation response', {
        responseType: response.type,
        status: response.type === 'PAGE_TRANSLATION_FINISHED' ? response.status : undefined,
      });

      if (response.type === 'PAGE_TRANSLATION_FAILED') {
        throw new Error(response.message);
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
      if (needsViewportRescanAfterCurrent && viewportModeStarted && host.isConnected) {
        needsViewportRescanAfterCurrent = false;
        logDebug('floating ball retrying queued viewport scan');
        scheduleViewportTranslation();
      }
    }
  }

  function scheduleViewportTranslation() {
    if (!viewportModeStarted || !host.isConnected) {
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
    if (!viewportModeStarted || !host.isConnected) {
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
    if (!viewportModeStarted || !host.isConnected) {
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
  contentObserver.observe(root, {
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
  };
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
