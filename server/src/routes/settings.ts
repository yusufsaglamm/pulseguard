import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppVariables } from '../auth/middleware.js';
import { updateSettingsSchema } from '../schemas/validation.js';

export function createSettingsRoutes(db: DatabaseSync) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/', (c) => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return c.json({
      site_title: map.get('site_title') ?? 'PulseGuard Servis Durumu',
      site_description: map.get('site_description') ?? '',
    });
  });

  app.put('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz ayar verisi.' },
        400,
      );
    }

    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    upsert.run('site_title', parsed.data.site_title);
    upsert.run('site_description', parsed.data.site_description);

    return c.json(parsed.data);
  });

  return app;
}
