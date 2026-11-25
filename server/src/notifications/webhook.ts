import { createHmac } from 'node:crypto';
import type { AlertPayload, FetchLike, WebhookConfig } from './types.js';

export function signWebhookBody(body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

export async function sendWebhookAlert(
  config: WebhookConfig,
  payload: AlertPayload,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const body = JSON.stringify({
    source: 'pulseguard',
    ...payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-PulseGuard-Event': payload.event,
  };

  if (config.secret && config.secret.length > 0) {
    headers['X-PulseGuard-Signature'] = signWebhookBody(body, config.secret);
  }

  const res = await fetchFn(config.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook HTTP ${res.status}`);
  }
}
