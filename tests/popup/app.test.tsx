import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../src/popup/App';

describe('Popup App', () => {
  it('sends translation and display-mode requests for the active tab', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    render(<App getActiveTabId={getActiveTabId} sendRuntimeMessage={sendRuntimeMessage} />);

    fireEvent.click(screen.getByRole('button', { name: '翻译当前页面' }));
    fireEvent.click(screen.getByRole('button', { name: '仅看译文' }));

    await waitFor(() => {
      expect(getActiveTabId).toHaveBeenCalled();
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'START_PAGE_TRANSLATION',
        tabId: 3,
      });
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'SET_DISPLAY_MODE',
        tabId: 3,
        displayMode: 'translated-only',
      });
    });
  });
});
