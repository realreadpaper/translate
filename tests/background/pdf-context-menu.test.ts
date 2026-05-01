import { describe, expect, it, vi } from 'vitest';

import { createPdfContextMenuController } from '../../src/background/pdf-context-menu';
import type { TranslationTarget } from '../../src/shared/translation-target';

describe('createPdfContextMenuController', () => {
  it('creates page and extension-action pdf menus and opens the pdf workspace from the clicked tab', async () => {
    const pdfTarget = {
      kind: 'pdf-document',
      tabId: 9,
      url: 'https://arxiv.org/pdf/2604.26805',
      sourceKind: 'http-url',
      displayName: '2604.26805',
    } satisfies TranslationTarget;
    const createMenu = vi.fn();
    const detectTarget = vi.fn().mockResolvedValue(pdfTarget);
    const openPdfWorkspace = vi.fn().mockResolvedValue(31);
    const controller = createPdfContextMenuController({
      createMenu,
      detectTarget,
      openPdfWorkspace,
    });

    controller.install();
    await controller.handleClicked(
      {
        menuItemId: 'immersive-ai-translate-pdf',
        pageUrl: 'https://arxiv.org/pdf/2604.26805',
      },
      {
        id: 9,
        url: 'https://arxiv.org/pdf/2604.26805',
      },
    );

    expect(createMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'immersive-ai-translate-pdf',
        title: '护眼翻译此 PDF',
        contexts: ['page'],
        documentUrlPatterns: expect.arrayContaining(['*://*/pdf/*', '*://*/*.pdf*']),
      }),
    );
    expect(createMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'immersive-ai-translate-pdf-action',
        title: '护眼翻译当前 PDF',
        contexts: ['action'],
      }),
    );
    expect(detectTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        url: 'https://arxiv.org/pdf/2604.26805',
      }),
    );
    expect(openPdfWorkspace).toHaveBeenCalledWith(pdfTarget);
  });

  it('ignores clicks when the active target is not a pdf document', async () => {
    const openPdfWorkspace = vi.fn();
    const controller = createPdfContextMenuController({
      createMenu: vi.fn(),
      detectTarget: vi.fn().mockResolvedValue({
        kind: 'html-page',
        tabId: 9,
        url: 'https://example.com/article',
      } satisfies TranslationTarget),
      openPdfWorkspace,
    });

    await controller.handleClicked(
      {
        menuItemId: 'immersive-ai-translate-pdf',
        pageUrl: 'https://example.com/article',
      },
      {
        id: 9,
        url: 'https://example.com/article',
      },
    );

    expect(openPdfWorkspace).not.toHaveBeenCalled();
  });
});
