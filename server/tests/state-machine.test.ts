import { describe, it, expect } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { processProbeResult } from '../src/monitoring/state-machine.js';

function createTestMonitor(failureThreshold = 3) {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const now = '2026-11-25T10:00:00.000Z';
  const res = db
    .prepare(
      `INSERT INTO monitors (name, type, target, failure_threshold, created_at, updated_at)
       VALUES ('Ana API', 'api', 'https://api.example.com/health', ?, ?, ?)`,
    )
    .run(failureThreshold, now, now);
  return { db, monitorId: Number(res.lastInsertRowid) };
}

describe('3-strike monitor state machine', () => {
  it('marks DOWN only on 3rd consecutive failure and emits single UP alert on recovery', () => {
    const { db, monitorId } = createTestMonitor(3);

    // Initial up -> no alert
    const initUp = processProbeResult(
      db,
      monitorId,
      { isUp: true, statusCode: 200, latencyMs: 25, errorMessage: null },
      '2026-11-25T10:01:00.000Z',
    );
    expect(initUp.nextStatus).toBe('up');
    expect(initUp.alertEvent).toBeNull();

    // Strike 1
    const f1 = processProbeResult(
      db,
      monitorId,
      { isUp: false, statusCode: 500, latencyMs: 120, errorMessage: 'HTTP 500' },
      '2026-11-25T10:02:00.000Z',
    );
    expect(f1.nextStatus).toBe('up');
    expect(f1.consecutiveFailures).toBe(1);
    expect(f1.alertEvent).toBeNull();

    // Strike 2
    const f2 = processProbeResult(
      db,
      monitorId,
      { isUp: false, statusCode: 500, latencyMs: 130, errorMessage: 'HTTP 500' },
      '2026-11-25T10:03:00.000Z',
    );
    expect(f2.nextStatus).toBe('up');
    expect(f2.consecutiveFailures).toBe(2);
    expect(f2.alertEvent).toBeNull();

    // Strike 3 -> transitions to DOWN, opens 1 auto incident, emits DOWN alert
    const f3 = processProbeResult(
      db,
      monitorId,
      { isUp: false, statusCode: 503, latencyMs: 200, errorMessage: 'HTTP 503' },
      '2026-11-25T10:04:00.000Z',
    );
    expect(f3.nextStatus).toBe('down');
    expect(f3.consecutiveFailures).toBe(3);
    expect(f3.alertEvent?.type).toBe('down');
    expect(f3.alertEvent?.incidentId).toBeGreaterThan(0);

    // Strike 4 -> stays DOWN, NO duplicate alert or incident
    const f4 = processProbeResult(
      db,
      monitorId,
      { isUp: false, statusCode: 503, latencyMs: 210, errorMessage: 'HTTP 503' },
      '2026-11-25T10:05:00.000Z',
    );
    expect(f4.nextStatus).toBe('down');
    expect(f4.consecutiveFailures).toBe(4);
    expect(f4.alertEvent).toBeNull();

    const incidentsBeforeRecovery = db
      .prepare('SELECT id, status FROM incidents')
      .all() as Array<{ id: number; status: string }>;
    expect(incidentsBeforeRecovery).toHaveLength(1);
    expect(incidentsBeforeRecovery[0]?.status).toBe('investigating');

    // Recovery -> transitions to UP, resolves incident, emits single UP alert
    const rec = processProbeResult(
      db,
      monitorId,
      { isUp: true, statusCode: 200, latencyMs: 30, errorMessage: null },
      '2026-11-25T10:06:00.000Z',
    );
    expect(rec.nextStatus).toBe('up');
    expect(rec.consecutiveFailures).toBe(0);
    expect(rec.alertEvent?.type).toBe('up');
    expect(rec.alertEvent?.incidentId).toBe(incidentsBeforeRecovery[0]?.id);

    const incidentAfter = db
      .prepare('SELECT status, resolved_at FROM incidents WHERE id = ?')
      .get(incidentsBeforeRecovery[0]!.id) as { status: string; resolved_at: string | null };
    expect(incidentAfter.status).toBe('resolved');
    expect(incidentAfter.resolved_at).toBe('2026-11-25T10:06:00.000Z');

    // Subsequent UP -> NO duplicate alert
    const steadyUp = processProbeResult(
      db,
      monitorId,
      { isUp: true, statusCode: 200, latencyMs: 28, errorMessage: null },
      '2026-11-25T10:07:00.000Z',
    );
    expect(steadyUp.alertEvent).toBeNull();

    // Daily stats accuracy
    const stat = db
      .prepare('SELECT * FROM daily_stats WHERE monitor_id = ? AND day = ?')
      .get(monitorId, '2026-11-25') as {
      total_checks: number;
      up_checks: number;
      down_checks: number;
      downtime_incidents: number;
    };
    expect(stat.total_checks).toBe(7);
    expect(stat.up_checks).toBe(3);
    expect(stat.down_checks).toBe(4);
    expect(stat.downtime_incidents).toBe(1);
  });

  it('suppresses alerts during an active maintenance window with suppress_alerts=1', () => {
    const { db, monitorId } = createTestMonitor(3);
    const now = '2026-11-25T12:00:00.000Z';

    db.prepare(
      `INSERT INTO maintenances (title, description, status, starts_at, ends_at, suppress_alerts, affected_monitor_ids_json, created_at, updated_at)
       VALUES ('Planlı Bakım', 'Veritabanı yükseltmesi', 'in_progress', '2026-11-25T11:30:00.000Z', '2026-11-25T13:00:00.000Z', 1, ?, ?, ?)`,
    ).run(JSON.stringify([monitorId]), now, now);

    processProbeResult(db, monitorId, { isUp: false, statusCode: 500, latencyMs: 50, errorMessage: 'err' }, now);
    processProbeResult(db, monitorId, { isUp: false, statusCode: 500, latencyMs: 50, errorMessage: 'err' }, now);
    const third = processProbeResult(
      db,
      monitorId,
      { isUp: false, statusCode: 500, latencyMs: 50, errorMessage: 'err' },
      now,
    );

    expect(third.nextStatus).toBe('down');
    expect(third.suppressed).toBe(true);
    expect(third.alertEvent).toBeNull();
  });
});
