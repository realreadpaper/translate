import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_TRANSLATION_BATCH_SIZE } from '../../../src/background/translator/config';

describe('translator config', () => {
  it('keeps page translation batches small enough for interactive webpage translation', () => {
    expect(DEFAULT_PAGE_TRANSLATION_BATCH_SIZE).toBeLessThanOrEqual(8);
  });
});
