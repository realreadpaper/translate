import { describe, expect, it } from 'vitest';

import { createPdfJobStore } from '../../../src/background/pdf/job-store';

describe('createPdfJobStore', () => {
  it('stores and retrieves a standalone pdf translation job', () => {
    const store = createPdfJobStore();
    const id = store.put({
      target: {
        kind: 'pdf-document',
        tabId: 7,
        url: 'https://example.com/report.pdf',
        sourceKind: 'http-url',
        displayName: 'report.pdf',
      },
      targetLanguage: 'zh-CN',
    });

    expect(store.get(id)).toMatchObject({
      target: {
        kind: 'pdf-document',
        displayName: 'report.pdf',
      },
    });
  });
});
