import type { ProviderTransport } from './types';
import { getProvider } from './registry';
import type { ProviderId, ProviderSettingsById } from '../../shared/types';

export async function testProviderConnection<T extends ProviderId>(
  providerId: T,
  settings: ProviderSettingsById[T],
  transport: ProviderTransport,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const provider = getProvider(providerId);
  const validation = provider.validateConfig(settings);

  if (!validation.ok) {
    return validation;
  }

  if (providerId === 'traditional') {
    return {
      ok: true,
      message: '连接成功',
    };
  }

  const connectionSettings = settings as ProviderSettingsById['deepseek' | 'openai-compatible'];

  try {
    const response = (await transport({
      url: `${connectionSettings.baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: {
        Authorization: `Bearer ${connectionSettings.apiKey}`,
      },
      body: {
        model: connectionSettings.model,
        messages: [
          {
            role: 'user',
            content: 'Reply with OK if the connection works.',
          },
        ],
        max_tokens: 8,
      },
    })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      return {
        ok: false,
        message: provider.normalizeError(new Error('Empty probe response')),
      };
    }

    return {
      ok: true,
      message: '连接成功',
    };
  } catch (error) {
    return {
      ok: false,
      message: provider.normalizeError(error),
    };
  }
}
