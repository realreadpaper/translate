type TranslatedSegment = { id: string; translatedText: string };
type SourceSegment = { id: string; text: string };
type TranslationContentKind = 'html-page' | 'pdf-document' | 'youtube-subtitles';

export const TRANSLATION_SYSTEM_PROMPT =
  [
    'You are a professional translation engine for immersive bilingual reading.',
    'Translate every input segment faithfully into the requested target language.',
    'Return only one valid JSON object matching exactly this shape: {"segments":[{"id":"same id","translatedText":"translation"}]}.',
    'The output segments array must contain exactly one item for every input segment.',
    'Copy each input id byte-for-byte into the matching output item. Never translate, shorten, rename, or omit ids.',
    'Use the key translatedText for every translation. Do not use translation, text, targetText, result, or any other key.',
    'Do not return a top-level array, object map, markdown fence, explanation, note, apology, or extra text.',
    'If a segment is hard to translate, keep its original text in translatedText rather than dropping the segment.',
  ].join('\n');

export function buildTranslationSystemPrompt(
  contentKind: TranslationContentKind = 'html-page',
): string {
  const contentGuidance: Record<TranslationContentKind, string> = {
    'html-page': [
      'For web page text, preserve the original tone and intent.',
      'Keep URLs, product names, code identifiers, and UI labels stable unless translation is clearly expected.',
    ].join('\n'),
    'pdf-document': [
      'The input is from an academic or technical PDF.',
      'Translate in a precise, publication-quality style suitable for bilingual reading.',
      'Preserve formulas, citations, references, code identifiers, variable names, model names, dataset names, section numbers, figure/table labels, and bibliography markers.',
      'Bibliography and reference-list entries must not be translated. If a segment is a bibliography item, copy the whole original segment exactly into translatedText.',
      'Treat numbered citation entries like "[46] Tianxin Wei, ... Evo-memory: Benchmarking llm agent test-time learning with self-evolving memory. arXiv preprint arXiv:2511.20857, 2025." as bibliography items and copy them unchanged.',
      'Also copy unchanged: URLs, DOIs, arXiv identifiers, paper titles inside reference lists, author names, venue names, publisher names, years, and citation metadata.',
      'Do not invent missing context. If a segment is a heading, caption, author list, affiliation, equation fragment, or reference fragment, translate only the natural-language parts and keep technical tokens intact.',
      'For non-bibliography citation markers inside prose, keep markers such as [46], (Wei et al., 2025), Fig. 2, Table 1, and Sec. 3 unchanged while translating the surrounding sentence.',
      'Use consistent terminology across all segments in the same request.',
    ].join('\n'),
    'youtube-subtitles': [
      'The input is timed subtitle text.',
      'Translate naturally and concisely so each cue remains readable on screen.',
      'Preserve names, numbers, code identifiers, and spoken emphasis where possible.',
    ].join('\n'),
  };

  return `${TRANSLATION_SYSTEM_PROMPT}\n\n${contentGuidance[contentKind]}`;
}

export function parseTranslatedSegments(
  content: string,
  sourceSegments: SourceSegment[] = [],
): TranslatedSegment[] {
  const normalizedContent = stripMarkdownJsonFence(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedContent);
  } catch (error) {
    const repairedContent = quoteBareTranslatedTextValues(normalizedContent);
    if (repairedContent !== normalizedContent) {
      try {
        return normalizeTranslatedSegments(JSON.parse(repairedContent), sourceSegments);
      } catch {
        // Fall through to the id-based recovery below.
      }
    }

    const recoveredSegments = recoverJsonLikeTranslatedSegments(normalizedContent, sourceSegments);
    if (recoveredSegments) {
      return recoveredSegments;
    }

    throw error;
  }

  return normalizeTranslatedSegments(parsed, sourceSegments);
}

function normalizeTranslatedSegments(
  parsed: unknown,
  sourceSegments: SourceSegment[],
): TranslatedSegment[] {
  const segments = getSegments(parsed, sourceSegments);

  if (!Array.isArray(segments)) {
    throw new Error('Provider returned malformed translated segments.');
  }

  const allSegmentsHaveIds = segments.every(isTranslatedSegmentLike);

  if (allSegmentsHaveIds) {
    return segments.map((segment) => ({
      id: segment.id,
      translatedText: getTranslatedText(segment) ?? '',
    }));
  }

  const noSegmentHasIds = segments.every(
    (segment) =>
      typeof segment === 'string' ||
      (isRecord(segment) &&
        typeof segment.id !== 'string' &&
        getTranslatedText(segment) !== undefined),
  );

  if (!noSegmentHasIds || segments.length !== sourceSegments.length) {
    throw new Error('Provider returned malformed translated segments.');
  }

  return segments.map((segment, index) => ({
    id: sourceSegments[index].id,
    translatedText:
      typeof segment === 'string' ? segment : isRecord(segment) ? getTranslatedText(segment) ?? '' : '',
  }));
}

function quoteBareTranslatedTextValues(content: string): string {
  const keyPattern = /"(?:translatedText|translation|targetText|translated|result|content|text)"\s*:/g;
  let repaired = '';
  let cursor = 0;

  for (const match of content.matchAll(keyPattern)) {
    const matchIndex = match.index;
    if (matchIndex === undefined || matchIndex < cursor) {
      continue;
    }

    let valueStart = matchIndex + match[0].length;
    while (/\s/.test(content[valueStart] ?? '')) {
      valueStart += 1;
    }

    const firstValueChar = content[valueStart];
    if (
      firstValueChar === undefined ||
      firstValueChar === '"' ||
      firstValueChar === '{' ||
      firstValueChar === '['
    ) {
      continue;
    }

    const valueEnd = findBareTranslatedTextValueEnd(content, valueStart);
    const rawValue = content.slice(valueStart, valueEnd).trim();
    if (!rawValue) {
      continue;
    }

    repaired += content.slice(cursor, valueStart);
    repaired += JSON.stringify(rawValue);
    cursor = valueEnd;
  }

  return repaired ? repaired + content.slice(cursor) : content;
}

function findBareTranslatedTextValueEnd(content: string, startIndex: number): number {
  for (let index = startIndex; index < content.length; index += 1) {
    const current = content[index];
    if (current === '}') {
      return startIndex + content.slice(startIndex, index).trimEnd().length;
    }

    if (
      current === ',' &&
      /^\s*"(?:id|translatedText|translation|targetText|translated|result|content|text)"\s*:/.test(
        content.slice(index + 1),
      )
    ) {
      return startIndex + content.slice(startIndex, index).trimEnd().length;
    }
  }

  return content.length;
}

function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function recoverJsonLikeTranslatedSegments(
  content: string,
  sourceSegments: SourceSegment[],
): TranslatedSegment[] | null {
  if (sourceSegments.length === 0) {
    return null;
  }

  const recovered: TranslatedSegment[] = [];
  const segmentPositions = sourceSegments.map((segment) => ({
    id: segment.id,
    position: findSegmentIdPosition(content, segment.id),
  }));

  if (segmentPositions.some((segment) => segment.position < 0)) {
    return null;
  }

  const sortedPositions = [...segmentPositions].sort((first, second) => first.position - second.position);
  for (const [index, segment] of sortedPositions.entries()) {
    const nextPosition = sortedPositions[index + 1]?.position ?? content.length;
    const segmentText = content.slice(segment.position, nextPosition);
    const translatedText = extractJsonLikeTranslatedText(segmentText);
    if (translatedText === undefined) {
      return null;
    }

    recovered.push({
      id: segment.id,
      translatedText,
    });
  }

  const recoveredById = new Map(recovered.map((segment) => [segment.id, segment.translatedText]));
  return sourceSegments.map((segment) => {
    const translatedText = recoveredById.get(segment.id);
    if (translatedText === undefined) {
      return null;
    }

    return {
      id: segment.id,
      translatedText,
    };
  }).filter((segment): segment is TranslatedSegment => segment !== null);
}

function findSegmentIdPosition(content: string, id: string): number {
  const jsonEncodedId = JSON.stringify(id);
  const quotedPosition = content.indexOf(jsonEncodedId);
  return quotedPosition >= 0 ? quotedPosition : content.indexOf(id);
}

function extractJsonLikeTranslatedText(segmentText: string): string | undefined {
  const keyMatch = segmentText.match(
    /"(?:translatedText|translation|targetText|translated|result|content|text)"\s*:/,
  );
  if (!keyMatch || keyMatch.index === undefined) {
    return undefined;
  }

  let valueStart = keyMatch.index + keyMatch[0].length;
  while (/\s/.test(segmentText[valueStart] ?? '')) {
    valueStart += 1;
  }

  if (segmentText[valueStart] === '"') {
    return extractQuotedJsonString(segmentText, valueStart);
  }

  const valueEnd = findJsonLikeValueEnd(segmentText, valueStart);
  const rawValue = segmentText.slice(valueStart, valueEnd).trim();
  return rawValue ? rawValue.replace(/,$/, '').trim() : undefined;
}

function extractQuotedJsonString(text: string, startIndex: number): string | undefined {
  for (let index = startIndex + 1; index < text.length; index += 1) {
    if (text[index] !== '"') {
      continue;
    }

    let backslashCount = 0;
    for (let cursor = index - 1; cursor > startIndex && text[cursor] === '\\'; cursor -= 1) {
      backslashCount += 1;
    }

    if (backslashCount % 2 === 0) {
      try {
        return JSON.parse(text.slice(startIndex, index + 1)) as string;
      } catch {
        return text.slice(startIndex + 1, index);
      }
    }
  }

  return undefined;
}

function findJsonLikeValueEnd(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index += 1) {
    const current = text[index];
    if (current !== '}') {
      continue;
    }

    const previous = text.slice(startIndex, index).trimEnd();
    return startIndex + previous.length;
  }

  return text.length;
}

function getSegments(parsed: unknown, sourceSegments: SourceSegment[]): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (Array.isArray(parsed.segments)) {
    return parsed.segments;
  }

  if (Array.isArray(parsed.translations)) {
    return parsed.translations;
  }

  return (
    getSegmentsFromTranslationMap(parsed.segments, sourceSegments) ??
    getSegmentsFromTranslationMap(parsed.translations, sourceSegments) ??
    getSegmentsFromTranslationMap(parsed, sourceSegments)
  );
}

function getSegmentsFromTranslationMap(
  maybeMap: unknown,
  sourceSegments: SourceSegment[],
): TranslatedSegment[] | null {
  if (!isRecord(maybeMap) || sourceSegments.length === 0) {
    return null;
  }

  const translated: TranslatedSegment[] = [];
  for (const sourceSegment of sourceSegments) {
    const value = maybeMap[sourceSegment.id];
    const translatedText =
      typeof value === 'string' ? value : isRecord(value) ? getTranslatedText(value) : undefined;

    if (translatedText === undefined) {
      return null;
    }

    translated.push({
      id: sourceSegment.id,
      translatedText,
    });
  }

  return translated;
}

function getTranslatedText(segment: object): string | undefined {
  if ('translatedText' in segment && typeof segment.translatedText === 'string') {
    return segment.translatedText;
  }

  if ('translation' in segment && typeof segment.translation === 'string') {
    return segment.translation;
  }

  if ('text' in segment && typeof segment.text === 'string') {
    return segment.text;
  }

  if ('targetText' in segment && typeof segment.targetText === 'string') {
    return segment.targetText;
  }

  if ('translated' in segment && typeof segment.translated === 'string') {
    return segment.translated;
  }

  if ('result' in segment && typeof segment.result === 'string') {
    return segment.result;
  }

  if ('content' in segment && typeof segment.content === 'string') {
    return segment.content;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTranslatedSegmentLike(
  segment: unknown,
): segment is { id: string } & Record<string, unknown> {
  return isRecord(segment) && typeof segment.id === 'string' && getTranslatedText(segment) !== undefined;
}
