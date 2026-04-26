import type {
  PageTranslationFailedMessage,
  PageTranslationFinishedMessage,
  StartPageTranslationMessage,
} from '../shared/messages';
import { extractSegments } from './dom-extractor';

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
const DEBUG_PREFIX = '[Immersive AI Translate]';
const VIEWPORT_PRELOAD_PX = 120;
const VIEWPORT_SEGMENT_LIMIT = 6;
const SCROLL_DEBOUNCE_MS = 120;

function logDebug(message: string, details?: Record<string, unknown>) {
  console.log(DEBUG_PREFIX, message, details ?? {});
}

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
  const completedSegmentIds = new Set<string>();
  const pendingSegmentIds = new Set<string>();

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
    const segments = extractSegments(root);
    const nextSegments = segments.filter((segment) => {
      if (completedSegmentIds.has(segment.id) || pendingSegmentIds.has(segment.id)) {
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
      logDebug('floating ball ignored duplicate translation click');
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

    segments.forEach((segment) => pendingSegmentIds.add(segment.id));
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
        completedSegmentIds.add(segment.id);
        pendingSegmentIds.delete(segment.id);
      });
      response.failedBatches.forEach((batch) => {
        batch.segmentIds.forEach((id) => pendingSegmentIds.delete(id));
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
      segments.forEach((segment) => pendingSegmentIds.delete(segment.id));
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

  trigger.addEventListener('click', () => {
    viewportModeStarted = true;
    void startTranslation();
  });
  window.addEventListener('scroll', scheduleViewportTranslation, { passive: true });

  setTriggerState('idle');

  return {
    markTranslated() {
      translated = true;
      setTriggerState('translated', translated ? '当前页面已翻译' : '翻译当前页面');
    },
    startTranslation,
  };
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
