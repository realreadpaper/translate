import type { ProviderTransport } from './types';

export const postJson: ProviderTransport = async ({ url, headers, body }) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw {
      status: response.status,
      message: message || response.statusText,
    };
  }

  return response.json();
};
