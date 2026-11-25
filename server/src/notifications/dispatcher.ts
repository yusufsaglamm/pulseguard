import type { DatabaseSync } from 'node:sqlite';
import type { AlertEvent } from '../monitoring/state-machine.js';
import { sendDiscordAlert } from './discord.js';
import { sendTelegramAlert } from './telegram.js';
import type {
  AlertPayload,
  ChannelRecord,
  DiscordConfig,
  FetchLike,
  TelegramConfig,
  WebhookConfig,
} from './types.js';
import { sendWebhookAlert } from './webhook.js';

export function redactChannelConfig(
  type: 'telegram' | 'discord' | 'webhook',
  configJson: string,
): Record<string, string> {
  try {
    const raw = JSON.parse(configJson) as Record<string, string>;
    if (type === 'telegram') {
      const token = raw.botToken ?? '';
      return {
        botToken: token ? `***${token.slice(-4)}` : '',
        chatId: raw.chatId ?? '',
      };
    }
    if (type === 'discord') {
      const url = raw.webhookUrl ?? '';
      return {
        webhookUrl: url ? `***${url.slice(-8)}` : '',
      };
    }
    const secret = raw.secret ?? '';
    return {
      url: raw.url ?? '',
      secret: secret ? `***${secret.slice(-4)}` : '',
    };
  } catch {
    return {};
  }
}

export class NotificationDispatcher {
  constructor(
    private readonly db: DatabaseSync,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async dispatchAlert(event: AlertEvent): Promise<void> {
    const channels = this.db
      .prepare('SELECT * FROM notification_channels WHERE is_enabled = 1')
      .all() as unknown as ChannelRecord[];

    if (channels.length === 0) return;

    const payload: AlertPayload = {
      event: event.type,
      monitorName: event.monitor.name,
      monitorType: event.monitor.type,
      target: event.monitor.target,
      errorMessage: event.errorMessage,
      latencyMs: event.latencyMs,
      timestamp: event.timestamp,
      incidentId: event.incidentId,
    };

    const results = await Promise.allSettled(
      channels.map((channel) => this.sendToChannel(channel, payload)),
    );

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const ch = channels[idx];
        const reason = result.reason instanceof Error ? result.reason.message : 'Bilinmeyen hata';
        console.error(
          `[NotificationDispatcher] Kanal gönderimi başarısız (id=${ch?.id}, type=${ch?.type}): ${reason}`,
        );
      }
    });
  }

  async sendTest(channel: ChannelRecord): Promise<{ ok: boolean; error?: string }> {
    const payload: AlertPayload = {
      event: 'test',
      monitorName: 'PulseGuard Test Servisi',
      monitorType: 'http',
      target: 'https://status.pulseguard.local',
      errorMessage: null,
      latencyMs: 18,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.sendToChannel(channel, payload);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Test bildirimi gönderilemedi.',
      };
    }
  }

  private async sendToChannel(channel: ChannelRecord, payload: AlertPayload): Promise<void> {
    const parsed = JSON.parse(channel.config_json) as Record<string, string>;
    if (channel.type === 'telegram') {
      await sendTelegramAlert(
        { botToken: parsed.botToken ?? '', chatId: parsed.chatId ?? '' } satisfies TelegramConfig,
        payload,
        this.fetchFn,
      );
      return;
    }
    if (channel.type === 'discord') {
      await sendDiscordAlert(
        { webhookUrl: parsed.webhookUrl ?? '' } satisfies DiscordConfig,
        payload,
        this.fetchFn,
      );
      return;
    }
    await sendWebhookAlert(
      { url: parsed.url ?? '', secret: parsed.secret } satisfies WebhookConfig,
      payload,
      this.fetchFn,
    );
  }
}
