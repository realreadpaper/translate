type YoutubeAdaptiveFormat = {
  mimeType?: string;
  bitrate?: number;
  url?: string;
  signatureCipher?: string;
};

type YoutubePlayerResponseWithStreamingData = {
  streamingData?: {
    adaptiveFormats?: YoutubeAdaptiveFormat[];
  };
};

export type YoutubeAudioFormatSelection =
  | {
      ok: true;
      format: {
        mimeType: string;
        bitrate?: number;
        url: string;
      };
    }
  | { ok: false; reason: 'no-audio-format' | 'signature-cipher-not-supported' };

export function selectYoutubeAudioFormat(
  playerResponse: YoutubePlayerResponseWithStreamingData | null,
): YoutubeAudioFormatSelection {
  const audioFormats = (playerResponse?.streamingData?.adaptiveFormats ?? [])
    .filter((format) => format.mimeType?.startsWith('audio/'))
    .sort(
      (a, b) =>
        (a.bitrate ?? Number.MAX_SAFE_INTEGER) - (b.bitrate ?? Number.MAX_SAFE_INTEGER),
    );

  const directFormat = audioFormats.find((format) => format.url && format.mimeType);
  if (directFormat?.url && directFormat.mimeType) {
    return {
      ok: true,
      format: {
        mimeType: directFormat.mimeType,
        bitrate: directFormat.bitrate,
        url: directFormat.url,
      },
    };
  }

  if (audioFormats.some((format) => format.signatureCipher)) {
    return { ok: false, reason: 'signature-cipher-not-supported' };
  }

  return { ok: false, reason: 'no-audio-format' };
}
