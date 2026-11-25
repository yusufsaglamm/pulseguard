import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppVariables } from '../auth/middleware.js';
import { maintenanceSchema } from '../schemas/validation.js';

function formatMaintenance(row: {
  id: number;
  title: string;
  description: string;
  status: string;
  starts_at: string;
  ends_at: string;
  suppress_alerts: number;
  affected_monitor_ids_json: string;
}) {
  let affectedMonitorIds: number[] = [];
  try {
    const parsed = JSON.parse(row.affected_monitor_ids_json) as unknown;
    if (Array.isArray(parsed)) {
      affectedMonitorIds = parsed.filter((id): id is number => typeof id === 'number');
    }
  } catch {
    affectedMonitorIds = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    suppressAlerts: row.suppress_alerts === 1,
    affectedMonitorIds,
  };
}

export function createMaintenanceRoutes(db: DatabaseSync) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/', (c) => {
    const rows = db
      .prepare('SELECT * FROM maintenances ORDER BY starts_at DESC, id DESC')
      .all() as Array<{
      id: number;
      title: string;
      description: string;
      status: string;
      starts_at: string;
      ends_at: string;
      suppress_alerts: number;
      affected_monitor_ids_json: string;
    }>;
    return c.json({ maintenances: rows.map(formatMaintenance) });
  });

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz bakım verisi.' },
        400,
      );
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO maintenances (
          title, description, status, starts_at, ends_at, suppress_alerts, affected_monitor_ids_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.title,
        d.description,
        d.status,
        d.startsAt,
        d.endsAt,
        d.suppressAlerts ? 1 : 0,
        JSON.stringify(d.affectedMonitorIds),
        now,
        now,
      );

    const created = db
      .prepare('SELECT * FROM maintenances WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as Parameters<typeof formatMaintenance>[0];
    return c.json({ maintenance: formatMaintenance(created) }, 201);
  });

  app.put('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz bakım kimliği.' }, 400);
    }

    const existing = db.prepare('SELECT id FROM maintenances WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Bakım kaydı bulunamadı.' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz bakım verisi.' },
        400,
      );
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE maintenances
       SET title = ?, description = ?, status = ?, starts_at = ?, ends_at = ?,
           suppress_alerts = ?, affected_monitor_ids_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      d.title,
      d.description,
      d.status,
      d.startsAt,
      d.endsAt,
      d.suppressAlerts ? 1 : 0,
      JSON.stringify(d.affectedMonitorIds),
      now,
      id,
    );

    const updated = db
      .prepare('SELECT * FROM maintenances WHERE id = ?')
      .get(id) as Parameters<typeof formatMaintenance>[0];
    return c.json({ maintenance: formatMaintenance(updated) });
  });

  app.delete('/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz bakım kimliği.' }, 400);
    }
    const result = db.prepare('DELETE FROM maintenances WHERE id = ?').run(id);
    if (Number(result.changes) === 0) {
      return c.json({ error: 'Bakım kaydı bulunamadı.' }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}
