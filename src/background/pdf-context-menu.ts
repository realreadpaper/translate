import type { TranslationTarget } from '../shared/translation-target';

export const PDF_CONTEXT_MENU_ID = 'immersive-ai-translate-pdf';
export const PDF_ACTION_CONTEXT_MENU_ID = 'immersive-ai-translate-pdf-action';

type BrowserTabLike = {
  id?: number;
  url?: string;
  title?: string;
};

type ContextMenuClickLike = {
  menuItemId: string | number;
  pageUrl?: string;
  linkUrl?: string;
};

type PdfContextMenuDependencies = {
  createMenu: (properties: chrome.contextMenus.CreateProperties) => void;
  detectTarget: (tab: BrowserTabLike) => Promise<TranslationTarget>;
  openPdfWorkspace: (target: TranslationTarget) => Promise<number>;
  debugLog?: (message: string, details?: Record<string, unknown>) => void;
};

export function createPdfContextMenuController({
  createMenu,
  detectTarget,
  openPdfWorkspace,
  debugLog = () => undefined,
}: PdfContextMenuDependencies) {
  async function openFromTab(tab: BrowserTabLike, explicitUrl?: string): Promise<void> {
    if (typeof tab.id !== 'number') {
      debugLog('pdf context menu skipped because tab id is unavailable');
      return;
    }

    const target = await detectTarget({
      ...tab,
      url: explicitUrl || tab.url,
    });
    debugLog('pdf context menu target detected', {
      tabId: tab.id,
      targetKind: target.kind,
      url: target.url,
    });
    if (target.kind !== 'pdf-document') {
      return;
    }

    const workspaceTabId = await openPdfWorkspace(target);
    debugLog('pdf context menu opened workspace', {
      tabId: tab.id,
      workspaceTabId,
      sourceUrl: target.url,
    });
  }

  return {
    install(): void {
      createMenu({
        id: PDF_CONTEXT_MENU_ID,
        title: '护眼翻译此 PDF',
        contexts: ['page'],
        documentUrlPatterns: ['*://*/pdf/*', '*://*/*.pdf*'],
      });
      createMenu({
        id: PDF_ACTION_CONTEXT_MENU_ID,
        title: '护眼翻译当前 PDF',
        contexts: ['action'],
      });
    },

    async handleClicked(info: ContextMenuClickLike, tab?: BrowserTabLike): Promise<void> {
      const isPdfMenu =
        info.menuItemId === PDF_CONTEXT_MENU_ID ||
        info.menuItemId === PDF_ACTION_CONTEXT_MENU_ID;
      if (!isPdfMenu || !tab) {
        return;
      }

      await openFromTab(tab, info.pageUrl || info.linkUrl);
    },

    openFromTab,
  };
}
