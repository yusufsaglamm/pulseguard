import { describe, it, expect, vi } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { NotificationDispatcher, redactChannelConfig } from '../src/notifications/dispatcher.js';
import { signWebhookBody } from '../src/notifications/webhook.js';
import type { AlertEvent } from '../src/monitoring/state-machine.js';

describe('notification dispatchers', () => {
  it('fans out to enabled channels, includes HMAC signature, and isolates failures', async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const now = '2026-11-25T15:00:00.000Z';

    db.prepare(
      `INSERT INTO notification_channels (name, type, config_json, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'Telegram Ops',
      'telegram',
      JSON.stringify({ botToken: '12345:secret-token', chatId: '-100999' }),
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO notification_channels (name, type, config_json, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'Discord Ops',
      'discord',
      JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/1/abc' }),
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO notification_channels (name, type, config_json, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'Custom Webhook',
      'webhook',
      JSON.stringify({ url: 'https://hooks.example.com/alert', secret: 'my-hmac-secret' }),
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO notification_channels (name, type, config_json, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'Disabled Channel',
      'webhook',
      JSON.stringify({ url: 'https://disabled.example.com' }),
      0,
      now,
      now,
    );

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init: init ?? {} });
      if (url.includes('discord.com')) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response('ok', { status: 200 });
    });

    const dispatcher = new NotificationDispatcher(db, fakeFetch as unknown as typeof fetch);
    const alert: AlertEvent = {
      type: 'down',
      monitor: { id: 1, name: 'Ana Web', type: 'http', target: 'https://example.com' },
      incidentId: 42,
      errorMessage: 'HTTP 502',
      latencyMs: 412,
      timestamp: now,
    };

    // Even though Discord returns 429, dispatchAlert resolves cleanly and sends Telegram + Webhook
    await expect(dispatcher.dispatchAlert(alert)).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);

    const telegramCall = calls.find((c) => c.url.includes('api.telegram.org'));
    expect(telegramCall?.url).toBe('https://api.telegram.org/bot12345:secret-token/sendMessage');
    expect(String(telegramCall?.init.body)).toContain('DOWN');

    const webhookCall = calls.find((c) => c.url === 'https://hooks.example.com/alert');
    expect(webhookCall).toBeDefined();
    const webhookHeaders = webhookCall?.init.headers as Record<string, string>;
    expect(webhookHeaders['X-PulseGuard-Event']).toBe('down');
    expect(webhookHeaders['X-PulseGuard-Signature']).toBe(
      signWebhookBody(String(webhookCall?.init.body), 'my-hmac-secret'),
    );
  });

  it('redacts sensitive fields from channel configs', () => {
    expect(
      redactChannelConfig('telegram', JSON.stringify({ botToken: '123456:ABCDEF', chatId: '42' })),
    ).toEqual({ botToken: '***CDEF', chatId: '42' });

    expect(
      redactChannelConfig('discord', JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/1/12345678' })),
    ).toEqual({ webhookUrl: '***12345678' });

    expect(
      redactChannelConfig('webhook', JSON.stringify({ url: 'https://example.com/hook', secret: 'topsecret' })),
    ).toEqual({ url: 'https://example.com/hook', secret: '***cret' });
  });
});
