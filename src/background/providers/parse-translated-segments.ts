type TranslatedSegment = { id: string; translatedText: string };

export const TRANSLATION_SYSTEM_PROMPT =
  'Translate each segment. Return only a JSON array of objects with id and translatedText. Do not wrap the JSON in markdown.';

export function parseTranslatedSegments(content: string): TranslatedSegment[] {
  const parsed = JSON.parse(stripMarkdownJsonFence(content));
  const segments = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.segments)
      ? parsed.segments
      : Array.isArray(parsed?.translations)
        ? parsed.translations
        : null;

  if (!Array.isArray(segments)) {
    throw new Error('Provider returned malformed translated segments.');
  }

  const normalized = segments.map((segment) => {
    if (
      typeof segment !== 'object' ||
      segment === null ||
      typeof segment.id !== 'string' ||
      typeof segment.translatedText !== 'string'
    ) {
      throw new Error('Provider returned malformed translated segments.');
    }

    return {
      id: segment.id,
      translatedText: segment.translatedText,
    };
  });

  return normalized;
}

function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}
