export function shouldUsePdfOcrFallback(input: {
  pageNumber: number;
  textLength: number;
  imageCoverageRatio: number;
  unreadableGlyphRatio: number;
}) {
  return (
    input.textLength < 24 &&
    (input.imageCoverageRatio > 0.7 || input.unreadableGlyphRatio > 0.4)
  );
}
