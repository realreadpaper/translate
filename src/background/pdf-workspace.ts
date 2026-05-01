import type { ExtensionSettings } from '../shared/types';
import type { TranslationTarget } from '../shared/translation-target';

type PdfDocumentTarget = Extract<TranslationTarget, { kind: 'pdf-document' }>;

export type PdfWorkspaceMetadata = {
  sourceUrl: string;
  displayName: string;
  sourceKind: PdfDocumentTarget['sourceKind'];
};

type PdfWorkspaceOpenerDependencies = {
  getExtensionUrl: (path: string) => string;
  createTab: (properties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
};

export function createPdfWorkspaceOpener({
  getExtensionUrl,
  createTab,
}: PdfWorkspaceOpenerDependencies) {
  return async function openPdfWorkspace(
    target: TranslationTarget,
    _settings?: ExtensionSettings,
  ): Promise<number> {
    if (target.kind !== 'pdf-document') {
      throw new Error(`Unsupported PDF workspace target: ${target.kind}`);
    }

    const tab = await createTab({
      active: true,
      openerTabId: target.tabId,
      url: createPdfWorkspaceUrl(
        {
          sourceUrl: target.url,
          displayName: target.displayName,
          sourceKind: target.sourceKind,
        },
        getExtensionUrl,
      ),
    });

    if (typeof tab.id !== 'number') {
      throw new Error('PDF workspace tab id is unavailable.');
    }

    return tab.id;
  };
}

export function createPdfWorkspaceUrl(
  metadata: PdfWorkspaceMetadata,
  getExtensionUrl: (path: string) => string,
): string {
  const params = new URLSearchParams({
    sourceUrl: metadata.sourceUrl,
    displayName: metadata.displayName,
    sourceKind: metadata.sourceKind,
  });

  return `${getExtensionUrl('src/pdf/index.html')}?${params.toString()}`;
}
