import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config.js';
import type { AppVariables } from '../auth/middleware.js';
import type { MonitorRecord } from '../monitoring/prober.js';
import type { MonitorScheduler } from '../monitoring/scheduler.js';
import { createMonitorInputSchema } from '../schemas/validation.js';

function formatMonitor(row: MonitorRecord) {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.headers_json) as Record<string, string>;
  } catch {
    headers = {};
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    target: row.target,
    method: row.method,
    headers,
    expectedStatus: row.expected_status,
    expectedKeyword: row.expected_keyword,
    intervalSec: row.interval_sec,
    timeoutMs: row.timeout_ms,
    failureThreshold: row.failure_threshold,
    isPublic: row.is_public === 1,
    isActive: row.is_active === 1,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastCheckedAt: row.last_checked_at,
    lastLatencyMs: row.last_latency_ms,
    lastError: row.last_error,
  };
}

export function createMonitorRoutes(
  db: DatabaseSync,
  config: AppConfig,
  scheduler: MonitorScheduler,
) {
  const app = new Hono<{ Variables: AppVariables }>();
  const monitorSchema = createMonitorInputSchema(config.allowPrivateTargets);

  app.get('/', (c) => {
    const rows = db
      .prepare('SELECT * FROM monitors ORDER BY id ASC')
      .all() as unknown as MonitorRecord[];
    return c.json({ monitors: rows.map(formatMonitor) });
  });

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = monitorSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz monitör verisi.' },
        400,
      );
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO monitors (
          name, type, target, method, headers_json, expected_status, expected_keyword,
          interval_sec, timeout_ms, failure_threshold, is_public, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.name,
        d.type,
        d.target,
        d.method,
        JSON.stringify(d.headers),
        d.expectedStatus,
        d.expectedKeyword,
        d.intervalSec,
        d.timeoutMs,
        d.failureThreshold,
        d.isPublic ? 1 : 0,
        d.isActive ? 1 : 0,
        now,
        now,
      );

    const id = Number(res.lastInsertRowid);
    if (d.isActive) {
      scheduler.syncMonitor(id);
    }

    const created = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(id) as unknown as MonitorRecord;
    return c.json({ monitor: formatMonitor(created) }, 201);
  });

  app.put('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz monitör kimliği.' }, 400);
    }

    const existing = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(id) as MonitorRecord | undefined;
    if (!existing) {
      return c.json({ error: 'Monitör bulunamadı.' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = monitorSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz monitör verisi.' },
        400,
      );
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE monitors
       SET name = ?, type = ?, target = ?, method = ?, headers_json = ?,
           expected_status = ?, expected_keyword = ?, interval_sec = ?, timeout_ms = ?,
           failure_threshold = ?, is_public = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      d.name,
      d.type,
      d.target,
      d.method,
      JSON.stringify(d.headers),
      d.expectedStatus,
      d.expectedKeyword,
      d.intervalSec,
      d.timeoutMs,
      d.failureThreshold,
      d.isPublic ? 1 : 0,
      d.isActive ? 1 : 0,
      now,
      id,
    );

    if (d.isActive) {
      scheduler.syncMonitor(id);
    } else {
      scheduler.removeMonitor(id);
    }

    const updated = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(id) as unknown as MonitorRecord;
    return c.json({ monitor: formatMonitor(updated) });
  });

  app.delete('/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz monitör kimliği.' }, 400);
    }
    scheduler.removeMonitor(id);
    const result = db.prepare('DELETE FROM monitors WHERE id = ?').run(id);
    if (Number(result.changes) === 0) {
      return c.json({ error: 'Monitör bulunamadı.' }, 404);
    }
    return c.json({ ok: true });
  });

  app.post('/:id/check', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz monitör kimliği.' }, 400);
    }
    const existing = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(id) as MonitorRecord | undefined;
    if (!existing) {
      return c.json({ error: 'Monitör bulunamadı.' }, 404);
    }

    const outcome = await scheduler.runCheckNow(id);
    const updated = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(id) as unknown as MonitorRecord;
    return c.json({
      monitor: formatMonitor(updated),
      outcome,
    });
  });

  app.get('/:id/metrics', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Geçersiz monitör kimliği.' }, 400);
    }

    const existing = db
      .prepare('SELECT id, name FROM monitors WHERE id = ?')
      .get(id) as { id: number; name: string } | undefined;
    if (!existing) {
      return c.json({ error: 'Monitör bulunamadı.' }, 404);
    }

    const rangeParam = c.req.query('range') ?? '24h';
    const rangeHours =
      rangeParam === '30d' ? 30 * 24 : rangeParam === '7d' ? 7 * 24 : 24;
    const cutoffIso = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString();

    const rows = db
      .prepare(
        `SELECT id, is_up, status_code, latency_ms, error_message, checked_at
         FROM check_results
         WHERE monitor_id = ? AND checked_at >= ?
         ORDER BY checked_at ASC`,
      )
      .all(id, cutoffIso) as Array<{
      id: number;
      is_up: number;
      status_code: number | null;
      latency_ms: number;
      error_message: string | null;
      checked_at: string;
    }>;

    const totalChecks = rows.length;
    const upChecks = rows.filter((r) => r.is_up === 1).length;
    const latencies = rows.map((r) => r.latency_ms).sort((a, b) => a - b);

    const avgLatencyMs =
      totalChecks > 0
        ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / totalChecks)
        : null;
    const p95LatencyMs =
      totalChecks > 0
        ? latencies[Math.min(totalChecks - 1, Math.floor(totalChecks * 0.95))]!
        : null;
    const minLatencyMs = totalChecks > 0 ? latencies[0]! : null;
    const maxLatencyMs = totalChecks > 0 ? latencies[totalChecks - 1]! : null;
    const uptimePct =
      totalChecks > 0 ? Number(((upChecks / totalChecks) * 100).toFixed(2)) : null;

    // Downsample evenly if > 240 points so charts stay crisp and fast
    const maxPoints = 240;
    const sampledRows =
      rows.length <= maxPoints
        ? rows
        : rows.filter((_, idx) => idx % Math.ceil(rows.length / maxPoints) === 0 || idx === rows.length - 1);

    const points = sampledRows.map((r) => ({
      checkedAt: r.checked_at,
      latencyMs: r.latency_ms,
      isUp: r.is_up === 1,
      statusCode: r.status_code,
    }));

    const recentChecks = rows
      .slice(-20)
      .reverse()
      .map((r) => ({
        id: r.id,
        isUp: r.is_up === 1,
        statusCode: r.status_code,
        latencyMs: r.latency_ms,
        errorMessage: r.error_message,
        checkedAt: r.checked_at,
      }));

    return c.json({
      range: rangeParam === '30d' || rangeParam === '7d' ? rangeParam : '24h',
      summary: {
        totalChecks,
        uptimePct,
        avgLatencyMs,
        p95LatencyMs,
        minLatencyMs,
        maxLatencyMs,
      },
      points,
      recentChecks,
    });
  });

  return app;
}
