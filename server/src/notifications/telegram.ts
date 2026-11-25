import type { AlertPayload, FetchLike, TelegramConfig } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function formatTelegramMessage(payload: AlertPayload): string {
  const header =
    payload.event === 'down'
      ? '🔴 <b>SERVİS KESİNTİSİ (DOWN)</b>'
      : payload.event === 'up'
        ? '🟢 <b>SERVİS DÜZELDİ (UP)</b>'
        : '🔵 <b>PULSEGUARD TEST BİLDİRİMİ</b>';

  const lines = [
    header,
    `<b>Servis:</b> ${escapeHtml(payload.monitorName)} (${payload.monitorType.toUpperCase()})`,
    `<b>Hedef:</b> <code>${escapeHtml(payload.target)}</code>`,
  ];

  if (payload.latencyMs !== null) {
    lines.push(`<b>Yanıt Süresi:</b> ${payload.latencyMs} ms`);
  }
  if (payload.errorMessage) {
    lines.push(`<b>Hata:</b> ${escapeHtml(payload.errorMessage)}`);
  }
  lines.push(`<b>Zaman:</b> ${escapeHtml(payload.timestamp)}`);
  return lines.join('\n');
}

export async function sendTelegramAlert(
  config: TelegramConfig,
  payload: AlertPayload,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: formatTelegramMessage(payload),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Telegram API HTTP ${res.status}`);
  }
}
