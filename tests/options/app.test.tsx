import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../src/options/App';
import { createDefaultSettings } from '../../src/shared/config';

describe('Options App', () => {
  it('edits languages and provider credentials and saves settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    render(<App initialSettings={createDefaultSettings()} saveSettings={saveSettings} />);

    fireEvent.change(screen.getByLabelText('源语言'), {
      target: { value: 'en' },
    });
    fireEvent.change(screen.getByLabelText('目标语言'), {
      target: { value: 'ja' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI API Key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI Base URL'), {
      target: { value: 'https://example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI Model'), {
      target: { value: 'gpt-4.1-mini' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'en',
        targetLanguage: 'ja',
        providers: expect.objectContaining({
          'openai-compatible': expect.objectContaining({
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
            model: 'gpt-4.1-mini',
          }),
        }),
      }),
    );
  });
});
