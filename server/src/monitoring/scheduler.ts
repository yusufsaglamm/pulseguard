import type { DatabaseSync } from 'node:sqlite';
import { probeMonitor, type MonitorRecord } from './prober.js';
import { processProbeResult, type ProcessOutcome } from './state-machine.js';
import type { NotificationDispatcher } from '../notifications/dispatcher.js';

export class MonitorScheduler {
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private readonly inFlight = new Set<number>();
  private houseKeepingTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseSync,
    private readonly dispatcher: NotificationDispatcher,
    private readonly checkRetentionDays: number = 30,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const activeMonitors = this.db
      .prepare('SELECT id FROM monitors WHERE is_active = 1')
      .all() as Array<{ id: number }>;

    for (const row of activeMonitors) {
      this.syncMonitor(row.id);
    }

    this.runHousekeeping();
    this.houseKeepingTimer = setInterval(() => {
      this.runHousekeeping();
    }, 60_000);
    this.houseKeepingTimer.unref();
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    if (this.houseKeepingTimer) {
      clearInterval(this.houseKeepingTimer);
      this.houseKeepingTimer = null;
    }
  }

  syncMonitor(monitorId: number): void {
    this.removeMonitor(monitorId);
    if (!this.running) return;

    const monitor = this.db
      .prepare('SELECT id, interval_sec, is_active FROM monitors WHERE id = ?')
      .get(monitorId) as { id: number; interval_sec: number; is_active: number } | undefined;

    if (!monitor || monitor.is_active !== 1) return;

    const intervalMs = Math.max(10_000, monitor.interval_sec * 1000);
    const timer = setInterval(() => {
      void this.runCheckNow(monitorId).catch(() => {});
    }, intervalMs);
    timer.unref();
    this.timers.set(monitorId, timer);

    // Run an immediate initial check asynchronously when newly scheduled.
    void this.runCheckNow(monitorId).catch(() => {});
  }

  removeMonitor(monitorId: number): void {
    const existing = this.timers.get(monitorId);
    if (existing) {
      clearInterval(existing);
      this.timers.delete(monitorId);
    }
  }

  async runCheckNow(monitorId: number): Promise<ProcessOutcome | null> {
    if (this.inFlight.has(monitorId)) {
      return null;
    }
    const monitor = this.db
      .prepare('SELECT * FROM monitors WHERE id = ?')
      .get(monitorId) as MonitorRecord | undefined;

    if (!monitor) {
      this.removeMonitor(monitorId);
      return null;
    }

    this.inFlight.add(monitorId);
    try {
      const probe = await probeMonitor(monitor);
      const outcome = processProbeResult(this.db, monitorId, probe);
      if (outcome.alertEvent) {
        await this.dispatcher.dispatchAlert(outcome.alertEvent);
      }
      return outcome;
    } finally {
      this.inFlight.delete(monitorId);
    }
  }

  runHousekeeping(nowMs: number = Date.now()): void {
    const nowIso = new Date(nowMs).toISOString();

    // Auto-advance maintenance statuses based on schedule
    this.db
      .prepare(
        `UPDATE maintenances
         SET status = 'in_progress', updated_at = ?
         WHERE status = 'scheduled' AND starts_at <= ? AND ends_at > ?`,
      )
      .run(nowIso, nowIso, nowIso);

    this.db
      .prepare(
        `UPDATE maintenances
         SET status = 'completed', updated_at = ?
         WHERE status IN ('scheduled', 'in_progress') AND ends_at <= ?`,
      )
      .run(nowIso, nowIso);

    // Prune raw check_results older than retention window
    const cutoffIso = new Date(
      nowMs - this.checkRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    this.db.prepare('DELETE FROM check_results WHERE checked_at < ?').run(cutoffIso);
  }
}
