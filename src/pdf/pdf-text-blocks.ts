export type PdfTextRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTextBlock = {
  id: string;
  pageNumber: number;
  readingOrder: number;
  text: string;
  rect: PdfTextRect;
};

export type PdfTextItemLike = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

const LINE_Y_TOLERANCE = 4;
const PARAGRAPH_LINE_GAP_MAX = 18;

type PositionedTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextLine = {
  text: string;
  rect: PdfTextRect;
};

export function mergePdfTextItems(
  items: PdfTextItemLike[],
  pageNumber: number,
): PdfTextBlock[] {
  const positionedItems = items
    .map((item) => toPositionedTextItem(item))
    .filter((item): item is PositionedTextItem => item !== null)
    .sort((left, right) => {
      if (Math.abs(left.y - right.y) > LINE_Y_TOLERANCE) {
        return right.y - left.y;
      }

      return left.x - right.x;
    });

  const lineItems: PositionedTextItem[][] = [];
  for (const item of positionedItems) {
    const currentLine = lineItems.at(-1);
    if (currentLine && Math.abs(currentLine[0].y - item.y) <= LINE_Y_TOLERANCE) {
      currentLine.push(item);
    } else {
      lineItems.push([item]);
    }
  }

  const lines = lineItems.map((line) => {
    const rect = mergeRects(line);
    return {
      text: line.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim(),
      rect,
    };
  });

  const paragraphLines = mergeLinesIntoParagraphs(lines);

  return paragraphLines.map((paragraph, readingOrder) => ({
    id: `pdf-page-${pageNumber}-block-${readingOrder}`,
    pageNumber,
    readingOrder,
    text: paragraph.text,
    rect: paragraph.rect,
  }));
}

function toPositionedTextItem(item: PdfTextItemLike): PositionedTextItem | null {
  const text = item.str.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  return {
    text,
    x: item.transform[4] ?? 0,
    y: item.transform[5] ?? 0,
    width: item.width ?? 0,
    height: item.height ?? 0,
  };
}

function mergeRects(items: PositionedTextItem[]): PdfTextRect {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function mergeLinesIntoParagraphs(lines: TextLine[]): TextLine[] {
  const paragraphs: TextLine[] = [];

  for (const line of lines) {
    const currentParagraph = paragraphs.at(-1);
    if (currentParagraph && shouldMergeLineIntoParagraph(currentParagraph, line)) {
      currentParagraph.text = `${currentParagraph.text} ${line.text}`.replace(/\s+/g, ' ').trim();
      currentParagraph.rect = mergeTextLineRects(currentParagraph.rect, line.rect);
      continue;
    }

    paragraphs.push({ ...line });
  }

  return paragraphs;
}

function shouldMergeLineIntoParagraph(previous: TextLine, next: TextLine): boolean {
  const verticalGap = previous.rect.y - next.rect.y;
  if (verticalGap < 0 || verticalGap > PARAGRAPH_LINE_GAP_MAX) {
    return false;
  }

  if (looksLikeHeading(previous.text) || looksLikeHeading(next.text)) {
    return false;
  }

  return true;
}

function looksLikeHeading(text: string): boolean {
  return /^\d+(?:\.\d+)*\s+\S+/.test(text) || text.length <= 18 && /^[A-Z][A-Za-z\s]+$/.test(text);
}

function mergeTextLineRects(left: PdfTextRect, right: PdfTextRect): PdfTextRect {
  const minX = Math.min(left.x, right.x);
  const minY = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
