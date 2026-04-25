type PdfTextBlock = {
  id: string;
  pageNumber: number;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  readingOrder: number;
};

export async function extractPdfTextBlocks(pdfDocument: {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{
      items: Array<{ str: string; transform: number[]; width: number; height: number }>;
    }>;
  }>;
}) {
  const blocks: PdfTextBlock[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const joinedText = textContent.items.map((item) => item.str).join(' ').trim();

    if (!joinedText) {
      continue;
    }

    blocks.push({
      id: `page-${pageNumber}-block-0`,
      pageNumber,
      text: joinedText.replace(/\s+/g, ' '),
      rect: {
        x: textContent.items[0]?.transform[4] ?? 0,
        y: textContent.items[0]?.transform[5] ?? 0,
        width: textContent.items.reduce((sum, item) => sum + item.width, 0),
        height: textContent.items[0]?.height ?? 0,
      },
      readingOrder: 0,
    });
  }

  return blocks;
}
