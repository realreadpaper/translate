import { describe, expect, it } from 'vitest';

import { readPdfWorkspaceParams } from '../../src/pdf/workspace-params';

describe('readPdfWorkspaceParams', () => {
  it('reads pdf metadata directly from the workspace url query', () => {
    const search = new URLSearchParams({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      displayName: '2604.26805.pdf',
      sourceKind: 'http-url',
    }).toString();

    expect(readPdfWorkspaceParams(`?${search}`)).toEqual({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      displayName: '2604.26805.pdf',
      sourceKind: 'http-url',
      debugLoggingEnabled: false,
    });
  });

  it('uses stable defaults for optional display metadata', () => {
    const search = new URLSearchParams({
      sourceUrl: 'file:///Users/demo/report.pdf',
    }).toString();

    expect(readPdfWorkspaceParams(`?${search}`)).toEqual({
      sourceUrl: 'file:///Users/demo/report.pdf',
      displayName: 'report.pdf',
      sourceKind: 'file-url',
      debugLoggingEnabled: false,
    });
  });

  it('reads dnr redirected pdf source urls from the hash', () => {
    expect(readPdfWorkspaceParams('', '#sourceUrl=https://arxiv.org/pdf/2604.26805')).toEqual({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      displayName: '2604.26805',
      sourceKind: 'http-url',
      debugLoggingEnabled: false,
    });
  });

  it('enables pdf workspace debug logs from the query string', () => {
    const search = new URLSearchParams({
      sourceUrl: 'https://arxiv.org/pdf/2604.26805',
      debug: '1',
    }).toString();

    expect(readPdfWorkspaceParams(`?${search}`).debugLoggingEnabled).toBe(true);
  });
});
