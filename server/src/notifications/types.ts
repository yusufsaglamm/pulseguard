export type FetchLike = typeof fetch;

export interface AlertPayload {
  event: 'down' | 'up' | 'test';
  monitorName: string;
  monitorType: 'http' | 'api' | 'tcp';
  target: string;
  errorMessage: string | null;
  latencyMs: number | null;
  timestamp: string;
  incidentId?: number | null;
}

export interface ChannelRecord {
  id: number;
  name: string;
  type: 'telegram' | 'discord' | 'webhook';
  config_json: string;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface DiscordConfig {
  webhookUrl: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
}
