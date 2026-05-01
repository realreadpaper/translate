import { describe, expect, it } from 'vitest';

import { mergePdfTextItems } from '../../src/pdf/pdf-text-blocks';

describe('mergePdfTextItems', () => {
  it('groups pdf text items into ordered page blocks with rect anchors', () => {
    expect(
      mergePdfTextItems(
        [
          { str: 'second', transform: [1, 0, 0, 1, 10, 680], width: 44, height: 10 },
          { str: 'line', transform: [1, 0, 0, 1, 60, 680], width: 24, height: 10 },
          { str: 'first', transform: [1, 0, 0, 1, 10, 720], width: 30, height: 10 },
          { str: 'block', transform: [1, 0, 0, 1, 46, 720], width: 34, height: 10 },
        ],
        2,
      ),
    ).toEqual([
      {
        id: 'pdf-page-2-block-0',
        pageNumber: 2,
        readingOrder: 0,
        text: 'first block',
        rect: { x: 10, y: 720, width: 70, height: 10 },
      },
      {
        id: 'pdf-page-2-block-1',
        pageNumber: 2,
        readingOrder: 1,
        text: 'second line',
        rect: { x: 10, y: 680, width: 74, height: 10 },
      },
    ]);
  });

  it('merges consecutive pdf lines into paragraph blocks for better model context', () => {
    expect(
      mergePdfTextItems(
        [
          { str: 'Operating and maintaining large-scale systems demands', transform: [1, 0, 0, 1, 40, 720], width: 280, height: 10 },
          { str: 'substantial human effort for release monitoring.', transform: [1, 0, 0, 1, 40, 706], width: 250, height: 10 },
          { str: '1 Introduction', transform: [1, 0, 0, 1, 40, 660], width: 90, height: 12 },
          { str: 'Modern online services require careful operation.', transform: [1, 0, 0, 1, 40, 630], width: 230, height: 10 },
        ],
        1,
      ).map((block) => block.text),
    ).toEqual([
      'Operating and maintaining large-scale systems demands substantial human effort for release monitoring.',
      '1 Introduction',
      'Modern online services require careful operation.',
    ]);
  });
});
