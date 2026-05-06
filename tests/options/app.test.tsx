import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/options/App';
import { createDefaultSettings } from '../../src/shared/config';

afterEach(() => {
  cleanup();
});

describe('Options App', () => {
  it('edits languages and deepseek credentials and saves settings', async () => {
    let resolveSave: (() => void) | undefined;
    let resolveConnection: (() => void) | undefined;
    const saveSettings = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const testConnection = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnection = resolve;
        }),
    );

    render(
      <App
        initialSettings={createDefaultSettings()}
        saveSettings={saveSettings}
        testConnection={testConnection}
      />,
    );

    expect((screen.getByLabelText('当前服务') as HTMLSelectElement).value).toBe('deepseek');

    const apiKeyInput = screen.getByLabelText('DeepSeek API Key');
    expect((apiKeyInput as HTMLInputElement).type).toBe('password');

    fireEvent.change(screen.getByLabelText('源语言'), {
      target: { value: 'en' },
    });
    fireEvent.change(screen.getByLabelText('目标语言'), {
      target: { value: 'ja' },
    });
    fireEvent.change(screen.getByLabelText('DeepSeek API Key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.change(screen.getByLabelText('DeepSeek Base URL'), {
      target: { value: 'https://example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('DeepSeek Model'), {
      target: { value: 'deepseek-v4-flash' },
    });
    fireEvent.click(screen.getByLabelText('页面加载后自动翻译'));
    fireEvent.click(screen.getByLabelText('YouTube 字幕翻译'));
    fireEvent.change(screen.getByLabelText('PDF OCR 兜底'), {
      target: { value: 'disabled' },
    });
    fireEvent.change(screen.getByLabelText('字幕显示位置'), {
      target: { value: 'overlay-top' },
    });
    fireEvent.click(screen.getByLabelText('翻译缓存'));
    fireEvent.click(screen.getByLabelText('调试日志'));
    const saveButton = screen.getByRole('button', { name: '保存设置' });
    fireEvent.click(saveButton);

    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'deepseek',
        sourceLanguage: 'en',
        targetLanguage: 'ja',
        autoTranslateOnLoad: true,
        enableYoutubeSubtitleTranslation: false,
        enablePdfDocumentTranslation: true,
        pdfOcrFallback: 'disabled',
        youtubeAsrFallback: 'confirm-first',
        subtitleDisplayStyle: 'overlay-top',
        translationCacheEnabled: false,
        debugLoggingEnabled: true,
        providers: expect.objectContaining({
          deepseek: expect.objectContaining({
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
            model: 'deepseek-v4-flash',
          }),
        }),
      }),
    );

    resolveSave?.();

    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByText('保存成功')).toBeTruthy();
    });

    const connectionButton = screen.getByRole('button', { name: '测试连接' });
    fireEvent.click(connectionButton);

    expect((connectionButton as HTMLButtonElement).disabled).toBe(true);
    resolveSave?.();

    await waitFor(() => {
      expect(testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'deepseek',
          providers: expect.objectContaining({
            deepseek: expect.objectContaining({
              apiKey: 'sk-test',
            }),
          }),
        }),
      );
    });

    resolveConnection?.();

    await waitFor(() => {
      expect((connectionButton as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByText('连接成功')).toBeTruthy();
    });

    expect((screen.getByLabelText('页面加载后自动翻译') as HTMLInputElement).checked).toBe(true);
  });

  it('saves youtube asr provider settings and experimental audio prefetch toggle', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        initialSettings={createDefaultSettings()}
        saveSettings={saveSettings}
        testConnection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('实验性 YouTube 音频预抓'));
    fireEvent.change(screen.getByLabelText('YouTube ASR Base URL'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('YouTube ASR API Key'), {
      target: { value: 'asr-key' },
    });
    fireEvent.change(screen.getByLabelText('YouTube ASR 模型'), {
      target: { value: 'whisper-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          youtubeExperimentalAudioPrefetchEnabled: true,
          youtubeAsrProvider: {
            providerId: 'openai-compatible',
            apiKey: 'asr-key',
            baseUrl: 'https://api.example.com/v1',
            model: 'whisper-1',
          },
        }),
      );
    });
  });
});
