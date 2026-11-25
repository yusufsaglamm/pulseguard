import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppVariables } from '../auth/middleware.js';
import {
  createIncidentSchema,
  createIncidentUpdateSchema,
} from '../schemas/validation.js';

export function createIncidentRoutes(db: DatabaseSync) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/', (c) => {
    const rows = db
      .prepare(
        `SELECT i.id, i.monitor_id, m.name as monitor_name, i.title, i.status, i.severity, i.source, i.started_at, i.resolved_at
         FROM incidents i
         LEFT JOIN monitors m ON m.id = i.monitor_id
         ORDER BY i.started_at DESC, i.id DESC`,
      )
      .all() as Array<{
      id: number;
      monitor_id: number | null;
      monitor_name: string | null;
      title: string;
      status: string;
      severity: string;
      source: string;
      started_at: string;
      resolved_at: string | null;
    }>;

    const updates = db
      .prepare(
        'SELECT id, incident_id, status, message, created_at FROM incident_updates ORDER BY created_at DESC, id DESC',
      )
      .all() as Array<{
      id: number;
      incident_id: number;
      status: string;
      message: string;
      created_at: string;
    }>;

    const byIncident = new Map<number, typeof updates>();
    for (const u of updates) {
      const list = byIncident.get(u.incident_id) ?? [];
      list.push(u);
      byIncident.set(u.incident_id, list);
    }

    return c.json({
      incidents: rows.map((r) => ({
        id: r.id,
        monitorId: r.monitor_id,
        monitorName: r.monitor_name,
        title: r.title,
        status: r.status,
        severity: r.severity,
        source: r.source,
        startedAt: r.started_at,
        resolvedAt: r.resolved_at,
        updates: (byIncident.get(r.id) ?? []).map((u) => ({
          id: u.id,
          status: u.status,
          message: u.message,
          createdAt: u.created_at,
        })),
      })),
    });
  });

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz olay verisi.' },
        400,
      );
    }

    const d = parsed.data;
    if (d.monitorId !== null) {
      const exists = db
        .prepare('SELECT id FROM monitors WHERE id = ?')
        .get(d.monitorId);
      if (!exists) {
        return c.json({ error: 'Seçilen monitör bulunamadı.' }, 400);
      }
    }

    const now = new Date().toISOString();
    const resolvedAt = d.status === 'resolved' ? now : null;

    db.exec('BEGIN IMMEDIATE');
    try {
      const res = db
        .prepare(
          `INSERT INTO incidents (monitor_id, title, status, severity, source, started_at, resolved_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?)`,
        )
        .run(d.monitorId, d.title, d.status, d.severity, now, resolvedAt, now, now);
      const incidentId = Number(res.lastInsertRowid);

      db.prepare(
        `INSERT INTO incident_updates (incident_id, status, message, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(incidentId, d.status, d.message, now);

      db.exec('COMMIT');
      return c.json({ id: incidentId }, 201);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  app.post('/:id/updates', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz olay kimliği.' }, 400);
    }

    const existing = db.prepare('SELECT id FROM incidents WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Olay kaydı bulunamadı.' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createIncidentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz güncelleme verisi.' },
        400,
      );
    }

    const now = new Date().toISOString();
    const resolvedAt = parsed.data.status === 'resolved' ? now : null;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO incident_updates (incident_id, status, message, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(id, parsed.data.status, parsed.data.message, now);

      db.prepare(
        `UPDATE incidents
         SET status = ?, resolved_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(parsed.data.status, resolvedAt, now, id);

      db.exec('COMMIT');
      return c.json({ ok: true }, 201);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  app.delete('/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz olay kimliği.' }, 400);
    }
    const result = db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
    if (Number(result.changes) === 0) {
      return c.json({ error: 'Olay kaydı bulunamadı.' }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}
