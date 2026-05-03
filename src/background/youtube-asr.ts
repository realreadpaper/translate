import type { YoutubeSubtitleCue } from '../content/youtube/subtitle-overlay';
import type { YoutubeAsrProviderSettings } from '../shared/types';

export type YoutubeAudioChunk = {
  id: string;
  source: 'youtube-adaptive-format' | 'tab-capture';
  startMs: number;
  endMs: number;
  mimeType: string;
  data: Blob;
};

type PostForm = (
  url: string,
  formData: FormData,
  headers: Record<string, string>,
) => Promise<unknown>;

export async function transcribeYoutubeAudioChunks({
  chunks,
  settings,
  postForm,
}: {
  chunks: YoutubeAudioChunk[];
  settings: YoutubeAsrProviderSettings;
  postForm: PostForm;
}): Promise<YoutubeSubtitleCue[]> {
  if (!settings.apiKey) {
    throw new Error('请先配置 YouTube ASR API Key。');
  }

  const cues: YoutubeSubtitleCue[] = [];
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const formData = new FormData();
    formData.set('model', settings.model);
    formData.set('file', chunk.data, `${chunk.id}.webm`);

    const response = await postForm(
      `${settings.baseUrl.replace(/\/$/, '')}/audio/transcriptions`,
      formData,
      { Authorization: `Bearer ${settings.apiKey}` },
    );
    const text =
      response && typeof response === 'object' && 'text' in response
        ? String(response.text).trim()
        : '';
    if (!text) {
      continue;
    }

    cues.push({
      id: `asr-cue-${chunkIndex}-0`,
      text,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
    });
  }

  return cues;
}
