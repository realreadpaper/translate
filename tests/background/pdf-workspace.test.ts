import { describe, expect, it, vi } from 'vitest';

import { createPdfWorkspaceOpener } from '../../src/background/pdf-workspace';
import type { TranslationTarget } from '../../src/shared/translation-target';

describe('createPdfWorkspaceOpener', () => {
  it('opens the extension pdf workspace with source pdf metadata in the url', async () => {
    const target = {
      kind: 'pdf-document',
      tabId: 12,
      url: 'https://example.com/report.pdf',
      sourceKind: 'http-url',
      displayName: 'report.pdf',
    } satisfies TranslationTarget;
    const createTab = vi.fn().mockResolvedValue({ id: 42 });
    const opener = createPdfWorkspaceOpener({
      getExtensionUrl: (path) => `chrome-extension://demo/${path}`,
      createTab,
    });

    await expect(opener(target)).resolves.toBe(42);

    const expectedParams = new URLSearchParams({
      sourceUrl: 'https://example.com/report.pdf',
      displayName: 'report.pdf',
      sourceKind: 'http-url',
    });
    expect(createTab).toHaveBeenCalledWith({
      active: true,
      openerTabId: 12,
      url: `chrome-extension://demo/src/pdf/index.html?${expectedParams.toString()}`,
    });
  });
});
