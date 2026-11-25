import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppVariables } from '../auth/middleware.js';
import {
  redactChannelConfig,
  type NotificationDispatcher,
} from '../notifications/dispatcher.js';
import type { ChannelRecord } from '../notifications/types.js';
import {
  createChannelSchema,
  discordConfigSchema,
  telegramConfigSchema,
  updateChannelSchema,
  webhookConfigSchema,
} from '../schemas/validation.js';

function formatChannel(row: ChannelRecord) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isEnabled: row.is_enabled === 1,
    config: redactChannelConfig(row.type, row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMasked(val: string | undefined): boolean {
  return !val || val.startsWith('***');
}

export function createChannelRoutes(
  db: DatabaseSync,
  dispatcher: NotificationDispatcher,
) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/', (c) => {
    const rows = db
      .prepare('SELECT * FROM notification_channels ORDER BY id ASC')
      .all() as unknown as ChannelRecord[];
    return c.json({ channels: rows.map(formatChannel) });
  });

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz bildirim kanalı.' },
        400,
      );
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO notification_channels (name, type, config_json, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.name,
        d.type,
        JSON.stringify(d.config),
        d.isEnabled ? 1 : 0,
        now,
        now,
      );

    const created = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as ChannelRecord;
    return c.json({ channel: formatChannel(created) }, 201);
  });

  app.put('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz kanal kimliği.' }, 400);
    }

    const existing = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(id) as ChannelRecord | undefined;
    if (!existing) {
      return c.json({ error: 'Bildirim kanalı bulunamadı.' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz bildirim kanalı.' },
        400,
      );
    }

    const d = parsed.data;
    const prevConfig =
      existing.type === d.type
        ? (JSON.parse(existing.config_json) as Record<string, string>)
        : {};

    let mergedConfig: Record<string, string>;
    if (d.type === 'telegram') {
      const candidate = {
        botToken: isMasked(d.config.botToken)
          ? (prevConfig.botToken ?? '')
          : d.config.botToken ?? '',
        chatId: d.config.chatId ?? '',
      };
      const check = telegramConfigSchema.safeParse(candidate);
      if (!check.success) {
        return c.json({ error: check.error.issues[0]?.message ?? 'Geçersiz Telegram ayarı.' }, 400);
      }
      mergedConfig = check.data;
    } else if (d.type === 'discord') {
      const candidate = {
        webhookUrl: isMasked(d.config.webhookUrl)
          ? (prevConfig.webhookUrl ?? '')
          : d.config.webhookUrl ?? '',
      };
      const check = discordConfigSchema.safeParse(candidate);
      if (!check.success) {
        return c.json({ error: check.error.issues[0]?.message ?? 'Geçersiz Discord ayarı.' }, 400);
      }
      mergedConfig = check.data;
    } else {
      const candidate = {
        url: d.config.url ?? '',
        secret: isMasked(d.config.secret)
          ? (prevConfig.secret ?? '')
          : d.config.secret ?? '',
      };
      const check = webhookConfigSchema.safeParse(candidate);
      if (!check.success) {
        return c.json({ error: check.error.issues[0]?.message ?? 'Geçersiz Webhook ayarı.' }, 400);
      }
      mergedConfig = { url: check.data.url, secret: check.data.secret };
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE notification_channels
       SET name = ?, type = ?, config_json = ?, is_enabled = ?, updated_at = ?
       WHERE id = ?`,
    ).run(d.name, d.type, JSON.stringify(mergedConfig), d.isEnabled ? 1 : 0, now, id);

    const updated = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(id) as unknown as ChannelRecord;
    return c.json({ channel: formatChannel(updated) });
  });

  app.delete('/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz kanal kimliği.' }, 400);
    }
    const result = db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
    if (Number(result.changes) === 0) {
      return c.json({ error: 'Bildirim kanalı bulunamadı.' }, 404);
    }
    return c.json({ ok: true });
  });

  app.post('/:id/test', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz kanal kimliği.' }, 400);
    }
    const row = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(id) as ChannelRecord | undefined;
    if (!row) {
      return c.json({ error: 'Bildirim kanalı bulunamadı.' }, 404);
    }
    const result = await dispatcher.sendTest(row);
    return c.json(result, result.ok ? 200 : 502);
  });

  return app;
}
