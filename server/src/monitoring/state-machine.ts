import type { DatabaseSync } from 'node:sqlite';
import type { MonitorRecord, ProbeResult } from './prober.js';

export interface AlertEvent {
  type: 'down' | 'up';
  monitor: {
    id: number;
    name: string;
    type: 'http' | 'api' | 'tcp';
    target: string;
  };
  incidentId: number | null;
  errorMessage: string | null;
  latencyMs: number;
  timestamp: string;
}

export interface ProcessOutcome {
  previousStatus: 'up' | 'down' | 'unknown';
  nextStatus: 'up' | 'down' | 'unknown';
  consecutiveFailures: number;
  suppressed: boolean;
  alertEvent: AlertEvent | null;
}

/**
 * Checks whether an active maintenance window suppresses alerts for the given monitor.
 */
export function isAlertSuppressedByMaintenance(
  db: DatabaseSync,
  monitorId: number,
  nowIso: string,
): boolean {
  const rows = db
    .prepare(
      `SELECT affected_monitor_ids_json
       FROM maintenances
       WHERE suppress_alerts = 1
         AND status != 'completed'
         AND starts_at <= ?
         AND ends_at >= ?`,
    )
    .all(nowIso, nowIso) as Array<{ affected_monitor_ids_json: string }>;

  for (const row of rows) {
    try {
      const ids = JSON.parse(row.affected_monitor_ids_json) as unknown;
      if (!Array.isArray(ids) || ids.length === 0) {
        return true;
      }
      if (ids.includes(monitorId)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function upsertDailyStat(
  db: DatabaseSync,
  monitorId: number,
  day: string,
  isUp: boolean,
  latencyMs: number,
  newIncident: boolean,
): void {
  const existing = db
    .prepare(
      `SELECT total_checks, up_checks, down_checks, avg_latency_ms, max_latency_ms, downtime_incidents
       FROM daily_stats
       WHERE monitor_id = ? AND day = ?`,
    )
    .get(monitorId, day) as
    | {
        total_checks: number;
        up_checks: number;
        down_checks: number;
        avg_latency_ms: number;
        max_latency_ms: number;
        downtime_incidents: number;
      }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO daily_stats (
         monitor_id, day, total_checks, up_checks, down_checks, avg_latency_ms, max_latency_ms, downtime_incidents
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      monitorId,
      day,
      isUp ? 1 : 0,
      isUp ? 0 : 1,
      latencyMs,
      latencyMs,
      newIncident ? 1 : 0,
    );
    return;
  }

  const nextTotal = existing.total_checks + 1;
  const nextUp = existing.up_checks + (isUp ? 1 : 0);
  const nextDown = existing.down_checks + (isUp ? 0 : 1);
  const nextAvg =
    (existing.avg_latency_ms * existing.total_checks + latencyMs) / nextTotal;
  const nextMax = Math.max(existing.max_latency_ms, latencyMs);
  const nextIncidents = existing.downtime_incidents + (newIncident ? 1 : 0);

  db.prepare(
    `UPDATE daily_stats
     SET total_checks = ?,
         up_checks = ?,
         down_checks = ?,
         avg_latency_ms = ?,
         max_latency_ms = ?,
         downtime_incidents = ?
     WHERE monitor_id = ? AND day = ?`,
  ).run(nextTotal, nextUp, nextDown, nextAvg, nextMax, nextIncidents, monitorId, day);
}

/**
 * Applies the 3-strike failure threshold state machine and updates SQLite atomically.
 */
export function processProbeResult(
  db: DatabaseSync,
  monitorId: number,
  probe: ProbeResult,
  nowIso: string = new Date().toISOString(),
): ProcessOutcome {
  db.exec('BEGIN IMMEDIATE');
  try {
    const monitor = db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(monitorId) as MonitorRecord | undefined;

    if (!monitor) {
      throw new Error(`Monitor ${monitorId} bulunamadı`);
    }

    db.prepare(
      `INSERT INTO check_results (monitor_id, is_up, status_code, latency_ms, error_message, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      monitorId,
      probe.isUp ? 1 : 0,
      probe.statusCode,
      probe.latencyMs,
      probe.errorMessage,
      nowIso,
    );

    const previousStatus = monitor.status;
    let nextStatus: 'up' | 'down' | 'unknown' = previousStatus;
    let nextFailures = monitor.consecutive_failures;
    let openedIncidentId: number | null = null;
    let resolvedIncidentId: number | null = null;
    let transition: 'down' | 'up' | null = null;

    if (probe.isUp) {
      nextFailures = 0;
      nextStatus = 'up';
      if (previousStatus === 'down') {
        transition = 'up';
        const openIncidents = db
          .prepare(
            `SELECT id FROM incidents
             WHERE monitor_id = ? AND source = 'auto' AND status != 'resolved'
             ORDER BY id DESC`,
          )
          .all(monitorId) as Array<{ id: number }>;

        for (const inc of openIncidents) {
          db.prepare(
            `UPDATE incidents
             SET status = 'resolved', resolved_at = ?, updated_at = ?
             WHERE id = ?`,
          ).run(nowIso, nowIso, inc.id);
          db.prepare(
            `INSERT INTO incident_updates (incident_id, status, message, created_at)
             VALUES (?, 'resolved', ?, ?)`,
          ).run(
            inc.id,
            `Servis yeniden erişilebilir duruma geldi (yanıt süresi: ${probe.latencyMs} ms).`,
            nowIso,
          );
          if (resolvedIncidentId === null) {
            resolvedIncidentId = inc.id;
          }
        }
      }
    } else {
      nextFailures = monitor.consecutive_failures + 1;
      if (nextFailures >= monitor.failure_threshold && previousStatus !== 'down') {
        nextStatus = 'down';
        transition = 'down';

        const title = `${monitor.name} servisine erişilemiyor`;
        const severity = 'major';
        const incRes = db
          .prepare(
            `INSERT INTO incidents (monitor_id, title, status, severity, source, started_at, resolved_at, created_at, updated_at)
             VALUES (?, ?, 'investigating', ?, 'auto', ?, NULL, ?, ?)`,
          )
          .run(monitorId, title, severity, nowIso, nowIso, nowIso);
        openedIncidentId = Number(incRes.lastInsertRowid);

        const detail = probe.errorMessage
          ? `Ardışık ${nextFailures} kontrol başarısız oldu. Son hata: ${probe.errorMessage}`
          : `Ardışık ${nextFailures} kontrol başarısız oldu.`;
        db.prepare(
          `INSERT INTO incident_updates (incident_id, status, message, created_at)
           VALUES (?, 'investigating', ?, ?)`,
        ).run(openedIncidentId, detail, nowIso);
      }
    }

    const day = nowIso.slice(0, 10);
    upsertDailyStat(
      db,
      monitorId,
      day,
      probe.isUp,
      probe.latencyMs,
      transition === 'down',
    );

    db.prepare(
      `UPDATE monitors
       SET status = ?,
           consecutive_failures = ?,
           last_checked_at = ?,
           last_latency_ms = ?,
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      nextStatus,
      nextFailures,
      nowIso,
      probe.latencyMs,
      probe.errorMessage,
      nowIso,
      monitorId,
    );

    const suppressed =
      transition !== null ? isAlertSuppressedByMaintenance(db, monitorId, nowIso) : false;

    db.exec('COMMIT');

    let alertEvent: AlertEvent | null = null;
    if (transition && !suppressed) {
      alertEvent = {
        type: transition,
        monitor: {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          target: monitor.target,
        },
        incidentId: transition === 'down' ? openedIncidentId : resolvedIncidentId,
        errorMessage: probe.errorMessage,
        latencyMs: probe.latencyMs,
        timestamp: nowIso,
      };
    }

    return {
      previousStatus,
      nextStatus,
      consecutiveFailures: nextFailures,
      suppressed,
      alertEvent,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
