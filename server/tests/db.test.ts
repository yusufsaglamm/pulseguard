import { describe, it, expect } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { ensureDefaults } from '../src/db/seed.js';
import { loadConfig } from '../src/config.js';

describe('database schema & migrations', () => {
  it('runs migrations idempotently and enables foreign keys', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    runMigrations(db);

    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'admin_users',
        'sessions',
        'settings',
        'monitors',
        'check_results',
        'daily_stats',
        'incidents',
        'incident_updates',
        'maintenances',
        'notification_channels',
      ]),
    );
  });

  it('seeds default settings and optional admin user only once', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const config = loadConfig({
      ADMIN_EMAIL: 'Admin@PulseGuard.local',
      ADMIN_PASSWORD: 'supersecretpassword',
    });

    ensureDefaults(db, config);
    ensureDefaults(db, config);

    const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    expect(settings.find((s) => s.key === 'site_title')?.value).toBe(
      'PulseGuard Servis Durumu',
    );

    const admins = db.prepare('SELECT email FROM admin_users').all() as Array<{
      email: string;
    }>;
    expect(admins).toHaveLength(1);
    expect(admins[0]?.email).toBe('admin@pulseguard.local');
  });

  it('cascades monitor deletion to check_results and daily_stats', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO monitors (name, type, target, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('API', 'http', 'https://example.com', now, now);
    const monitorId = Number(res.lastInsertRowid);

    db.prepare(
      `INSERT INTO check_results (monitor_id, is_up, status_code, latency_ms, checked_at)
       VALUES (?, 1, 200, 42, ?)`,
    ).run(monitorId, now);
    db.prepare(
      `INSERT INTO daily_stats (monitor_id, day, total_checks, up_checks, down_checks, avg_latency_ms, max_latency_ms, downtime_incidents)
       VALUES (?, '2026-11-25', 1, 1, 0, 42, 42, 0)`,
    ).run(monitorId);

    db.prepare('DELETE FROM monitors WHERE id = ?').run(monitorId);

    const checks = db.prepare('SELECT COUNT(*) as c FROM check_results').get() as { c: number };
    const stats = db.prepare('SELECT COUNT(*) as c FROM daily_stats').get() as { c: number };
    expect(checks.c).toBe(0);
    expect(stats.c).toBe(0);
  });
});
