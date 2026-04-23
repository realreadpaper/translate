import type {
  PageTranslationFailedMessage,
  PageTranslationFinishedMessage,
  SetDisplayModeMessage,
  StartPageTranslationMessage,
} from '../shared/messages';
import type { DisplayMode } from '../shared/types';

type RuntimeMessage = StartPageTranslationMessage | SetDisplayModeMessage;
type TranslationResponse = PageTranslationFinishedMessage | PageTranslationFailedMessage;

type FloatingBallDependencies = {
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void | TranslationResponse>;
  openOptionsPage: () => Promise<void> | void;
  autoStart?: boolean;
};

type FloatingBallController = {
  updateDisplayMode: (mode: DisplayMode) => void;
  markTranslated: (mode: DisplayMode) => void;
  startTranslation: () => Promise<void>;
};

const FLOATING_BALL_STYLE_ID = 'immersive-ai-translate-floating-ball-style';

const MODE_LABELS: Record<DisplayMode, string> = {
  bilingual: '双语',
  'original-only': '仅原文',
  'translated-only': '仅译文',
};

export function mountFloatingBall(
  root: HTMLElement,
  { sendRuntimeMessage, openOptionsPage, autoStart = false }: FloatingBallDependencies,
): FloatingBallController {
  ensureFloatingBallStyles();

  const host = document.createElement('div');
  host.dataset.floatingBall = 'true';
  host.dataset.immersiveIgnore = 'true';

  host.innerHTML = `
    <div class="floating-ball">
      <button aria-label="翻译当前页面" class="floating-ball__trigger" data-floating-ball-trigger type="button">译</button>
      <section class="floating-ball__panel" data-floating-ball-panel hidden>
        <p class="floating-ball__status" data-floating-ball-status>等待开始翻译</p>
        <p class="floating-ball__mode" data-floating-ball-mode-line>当前模式：双语</p>
        <div class="floating-ball__modes">
          <button data-floating-ball-mode="bilingual" type="button">双语</button>
          <button data-floating-ball-mode="original-only" type="button">原文</button>
          <button data-floating-ball-mode="translated-only" type="button">译文</button>
        </div>
        <div class="floating-ball__actions">
          <button data-floating-ball-retry type="button">重新翻译</button>
          <button data-floating-ball-settings type="button">设置</button>
        </div>
      </section>
    </div>
  `;

  root.appendChild(host);

  const trigger = host.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
  const panel = host.querySelector('[data-floating-ball-panel]') as HTMLElement;
  const status = host.querySelector('[data-floating-ball-status]') as HTMLElement;
  const modeLine = host.querySelector('[data-floating-ball-mode-line]') as HTMLElement;
  const retryButton = host.querySelector('[data-floating-ball-retry]') as HTMLButtonElement;
  const settingsButton = host.querySelector('[data-floating-ball-settings]') as HTMLButtonElement;
  const modeButtons = Array.from(
    host.querySelectorAll('[data-floating-ball-mode]'),
  ) as HTMLButtonElement[];

  let translated = false;
  let isOpen = false;
  let isTranslating = false;
  let currentMode: DisplayMode = 'bilingual';
  let triggerState: 'idle' | 'loading' | 'translated' | 'partial-success' | 'error' = 'idle';

  function setTriggerState(
    nextState: 'idle' | 'loading' | 'translated' | 'partial-success' | 'error',
  ) {
    triggerState = nextState;
    trigger.dataset.state = nextState;
  }

  function renderMode(mode: DisplayMode) {
    currentMode = mode;
    modeLine.textContent = `当前模式：${MODE_LABELS[mode]}`;
    modeButtons.forEach((button) => {
      const isActive = button.dataset.floatingBallMode === mode;
      button.dataset.active = String(isActive);
    });
  }

  function setPanelOpen(nextOpen: boolean) {
    isOpen = nextOpen;
    panel.hidden = !nextOpen;
  }

  async function startTranslation(force = false) {
    if (isTranslating || (translated && !force)) {
      return;
    }

    isTranslating = true;
    trigger.disabled = true;
    setTriggerState('loading');
    status.textContent = '正在翻译当前页面...';

    try {
      const response = (await sendRuntimeMessage({
        type: 'START_PAGE_TRANSLATION',
      })) as TranslationResponse;

      if (response.type === 'PAGE_TRANSLATION_FAILED') {
        throw new Error(response.message);
      }

      translated = true;
      setPanelOpen(true);
      renderMode('bilingual');

      if (response.status === 'partial-success') {
        setTriggerState('partial-success');
        status.textContent = `已完成 ${response.translated.length} 段翻译，${response.failedBatches.length} 个批次失败`;
      } else {
        setTriggerState('translated');
        status.textContent = `已完成 ${response.translated.length} 段翻译`;
      }
    } catch (error) {
      setPanelOpen(true);
      setTriggerState('error');
      status.textContent = `翻译失败：${error instanceof Error ? error.message : String(error)}`;
      renderMode('bilingual');
    } finally {
      isTranslating = false;
      trigger.disabled = false;
    }
  }

  trigger.addEventListener('click', () => {
    if (!translated) {
      void startTranslation();
      return;
    }

    setPanelOpen(!isOpen);
  });

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.floatingBallMode as DisplayMode;
      void sendRuntimeMessage({
        type: 'SET_DISPLAY_MODE',
        displayMode: mode,
      });
      renderMode(mode);
    });
  });

  retryButton.addEventListener('click', () => {
    void startTranslation(true);
  });

  settingsButton.addEventListener('click', () => {
    void openOptionsPage();
  });

  setTriggerState('idle');
  renderMode('bilingual');

  if (autoStart) {
    queueMicrotask(() => {
      if (!translated && !isTranslating) {
        void startTranslation();
      }
    });
  }

  return {
    startTranslation,
    updateDisplayMode(mode) {
      renderMode(mode);
    },
    markTranslated(mode) {
      translated = true;
      setTriggerState('translated');
      renderMode(mode);
    },
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
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
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

    .floating-ball__panel {
      width: min(280px, calc(100vw - 32px));
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(143, 124, 92, 0.18);
      background: rgba(255, 252, 245, 0.96);
      box-shadow: 0 18px 40px rgba(66, 54, 35, 0.16);
      color: #1f2937;
    }

    .floating-ball__status,
    .floating-ball__mode {
      margin: 0;
      line-height: 1.5;
    }

    .floating-ball__status {
      font-size: 14px;
      font-weight: 700;
    }

    .floating-ball__mode {
      margin-top: 6px;
      color: #5a6471;
      font-size: 12px;
    }

    .floating-ball__modes,
    .floating-ball__actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .floating-ball__actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .floating-ball__panel button {
      border: 0;
      border-radius: 12px;
      padding: 10px 12px;
      background: #efe6d6;
      color: #1f2937;
      font: inherit;
      cursor: pointer;
    }

    .floating-ball__panel button[data-active="true"] {
      background: #1f2937;
      color: #fff;
    }
  `;

  document.head.appendChild(style);
}
