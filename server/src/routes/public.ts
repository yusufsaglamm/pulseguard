import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';

interface DailyStatRow {
  monitor_id: number;
  day: string;
  total_checks: number;
  up_checks: number;
  down_checks: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  downtime_incidents: number;
}

interface IncidentRow {
  id: number;
  monitor_id: number | null;
  monitor_name: string | null;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  source: 'auto' | 'manual';
  started_at: string;
  resolved_at: string | null;
}

interface IncidentUpdateRow {
  id: number;
  incident_id: number;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  message: string;
  created_at: string;
}

function buildLast90DayKeys(now: Date): string[] {
  const days: string[] = [];
  const baseUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let offset = 89; offset >= 0; offset -= 1) {
    const d = new Date(baseUtc - offset * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function createPublicRoutes(db: DatabaseSync) {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/public/status', (c) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const dayKeys = buildLast90DayKeys(now);
    const startDay = dayKeys[0]!;
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const settingRows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const settingsMap = new Map(settingRows.map((r) => [r.key, r.value]));

    const monitors = db
      .prepare(
        `SELECT id, name, type, status, last_checked_at, last_latency_ms
         FROM monitors
         WHERE is_active = 1 AND is_public = 1
         ORDER BY id ASC`,
      )
      .all() as Array<{
      id: number;
      name: string;
      type: 'http' | 'api' | 'tcp';
      status: 'up' | 'down' | 'unknown';
      last_checked_at: string | null;
      last_latency_ms: number | null;
    }>;

    const statsRows = db
      .prepare(
        `SELECT monitor_id, day, total_checks, up_checks, down_checks, avg_latency_ms, max_latency_ms, downtime_incidents
         FROM daily_stats
         WHERE day >= ?`,
      )
      .all(startDay) as unknown as DailyStatRow[];

    const statsByMonitor = new Map<number, Map<string, DailyStatRow>>();
    for (const row of statsRows) {
      let map = statsByMonitor.get(row.monitor_id);
      if (!map) {
        map = new Map();
        statsByMonitor.set(row.monitor_id, map);
      }
      map.set(row.day, row);
    }

    const publicMonitors = monitors.map((m) => {
      const mStats = statsByMonitor.get(m.id);
      let totalChecks90 = 0;
      let upChecks90 = 0;
      let weightedLatencySum = 0;

      const days90 = dayKeys.map((day) => {
        const stat = mStats?.get(day);
        if (!stat || stat.total_checks === 0) {
          return {
            day,
            status: 'no_data' as const,
            uptimePct: null,
            avgLatencyMs: null,
            totalChecks: 0,
            downtimeIncidents: 0,
          };
        }

        totalChecks90 += stat.total_checks;
        upChecks90 += stat.up_checks;
        weightedLatencySum += stat.avg_latency_ms * stat.total_checks;

        const uptimePct = Number(((stat.up_checks / stat.total_checks) * 100).toFixed(2));
        const dayStatus =
          uptimePct === 100 ? 'up' : uptimePct < 50 ? 'down' : 'degraded';

        return {
          day,
          status: dayStatus as 'up' | 'degraded' | 'down',
          uptimePct,
          avgLatencyMs: Math.round(stat.avg_latency_ms),
          totalChecks: stat.total_checks,
          downtimeIncidents: stat.downtime_incidents,
        };
      });

      const uptime90d =
        totalChecks90 > 0
          ? Number(((upChecks90 / totalChecks90) * 100).toFixed(2))
          : null;
      const avgLatency90d =
        totalChecks90 > 0 ? Math.round(weightedLatencySum / totalChecks90) : null;

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        lastCheckedAt: m.last_checked_at,
        lastLatencyMs: m.last_latency_ms,
        uptime90d,
        avgLatency90d,
        days90,
      };
    });

    const maintenanceRows = db
      .prepare(
        `SELECT id, title, description, status, starts_at, ends_at, affected_monitor_ids_json
         FROM maintenances
         WHERE status IN ('scheduled', 'in_progress')
            OR (status = 'completed' AND ends_at >= ?)
         ORDER BY starts_at ASC`,
      )
      .all(sevenDaysAgoIso) as Array<{
      id: number;
      title: string;
      description: string;
      status: 'scheduled' | 'in_progress' | 'completed';
      starts_at: string;
      ends_at: string;
      affected_monitor_ids_json: string;
    }>;

    const maintenances = maintenanceRows.map((row) => {
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
        affectedMonitorIds,
      };
    });

    const incidentRows = db
      .prepare(
        `SELECT i.id, i.monitor_id, m.name as monitor_name, i.title, i.status, i.severity, i.source, i.started_at, i.resolved_at
         FROM incidents i
         LEFT JOIN monitors m ON m.id = i.monitor_id
         WHERE i.status != 'resolved' OR i.started_at >= ?
         ORDER BY CASE WHEN i.status != 'resolved' THEN 0 ELSE 1 END, i.started_at DESC
         LIMIT 50`,
      )
      .all(thirtyDaysAgoIso) as unknown as IncidentRow[];

    const incidentIds = incidentRows.map((i) => i.id);
    const updatesByIncident = new Map<number, IncidentUpdateRow[]>();
    if (incidentIds.length > 0) {
      const placeholders = incidentIds.map(() => '?').join(', ');
      const updateRows = db
        .prepare(
          `SELECT id, incident_id, status, message, created_at
           FROM incident_updates
           WHERE incident_id IN (${placeholders})
           ORDER BY created_at DESC, id DESC`,
        )
        .all(...incidentIds) as unknown as IncidentUpdateRow[];
      for (const u of updateRows) {
        const list = updatesByIncident.get(u.incident_id) ?? [];
        list.push(u);
        updatesByIncident.set(u.incident_id, list);
      }
    }

    const incidents = incidentRows.map((inc) => ({
      id: inc.id,
      monitorId: inc.monitor_id,
      monitorName: inc.monitor_name,
      title: inc.title,
      status: inc.status,
      severity: inc.severity,
      source: inc.source,
      startedAt: inc.started_at,
      resolvedAt: inc.resolved_at,
      updates: (updatesByIncident.get(inc.id) ?? []).map((u) => ({
        id: u.id,
        status: u.status,
        message: u.message,
        createdAt: u.created_at,
      })),
    }));

    const downCount = publicMonitors.filter((m) => m.status === 'down').length;
    const activeMaintenanceCount = maintenances.filter(
      (m) => m.status === 'in_progress',
    ).length;
    const activeIncidentCount = incidents.filter((i) => i.status !== 'resolved').length;

    let overallStatus: 'operational' | 'partial_outage' | 'major_outage' | 'maintenance' =
      'operational';
    if (downCount > 0) {
      overallStatus =
        downCount >= Math.max(1, Math.ceil(publicMonitors.length / 2))
          ? 'major_outage'
          : 'partial_outage';
    } else if (activeMaintenanceCount > 0) {
      overallStatus = 'maintenance';
    } else if (activeIncidentCount > 0) {
      overallStatus = 'partial_outage';
    }

    return c.json({
      site: {
        title: settingsMap.get('site_title') ?? 'PulseGuard Servis Durumu',
        description: settingsMap.get('site_description') ?? '',
      },
      overallStatus,
      generatedAt: nowIso,
      monitors: publicMonitors,
      incidents,
      maintenances,
    });
  });

  return app;
}
