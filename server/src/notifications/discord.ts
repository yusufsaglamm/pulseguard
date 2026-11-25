import type { AlertPayload, DiscordConfig, FetchLike } from './types.js';

export function buildDiscordEmbed(payload: AlertPayload) {
  const isDown = payload.event === 'down';
  const isUp = payload.event === 'up';

  const title = isDown
    ? `🔴 Servis Kesintisi: ${payload.monitorName}`
    : isUp
      ? `🟢 Servis Düzeldi: ${payload.monitorName}`
      : `🔵 PulseGuard Test Bildirimi`;

  const color = isDown ? 0xdc2626 : isUp ? 0x16a34a : 0x3b82f6;

  const fields = [
    { name: 'Tür', value: payload.monitorType.toUpperCase(), inline: true },
    { name: 'Hedef', value: `\`${payload.target}\``, inline: true },
  ];

  if (payload.latencyMs !== null) {
    fields.push({ name: 'Yanıt Süresi', value: `${payload.latencyMs} ms`, inline: true });
  }
  if (payload.errorMessage) {
    fields.push({ name: 'Detay', value: payload.errorMessage.slice(0, 1000), inline: false });
  }

  return {
    embeds: [
      {
        title,
        color,
        fields,
        timestamp: payload.timestamp,
        footer: { text: 'PulseGuard Uptime Monitor' },
      },
    ],
  };
}

export async function sendDiscordAlert(
  config: DiscordConfig,
  payload: AlertPayload,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const res = await fetchFn(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDiscordEmbed(payload)),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Discord Webhook HTTP ${res.status}`);
  }
}
