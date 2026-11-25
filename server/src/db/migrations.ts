import type { DatabaseSync } from 'node:sqlite';

/**
 * Applies idempotent database schema migrations for PulseGuard.
 */
export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('http', 'api', 'tcp')),
      target TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      headers_json TEXT NOT NULL DEFAULT '{}',
      expected_status INTEGER,
      expected_keyword TEXT,
      interval_sec INTEGER NOT NULL DEFAULT 60,
      timeout_ms INTEGER NOT NULL DEFAULT 10000,
      failure_threshold INTEGER NOT NULL DEFAULT 3,
      is_public INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('up', 'down', 'unknown')),
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_checked_at TEXT,
      last_latency_ms INTEGER,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS check_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      is_up INTEGER NOT NULL,
      status_code INTEGER,
      latency_ms INTEGER NOT NULL,
      error_message TEXT,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time
      ON check_results(monitor_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS daily_stats (
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      total_checks INTEGER NOT NULL DEFAULT 0,
      up_checks INTEGER NOT NULL DEFAULT 0,
      down_checks INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms REAL NOT NULL DEFAULT 0,
      max_latency_ms INTEGER NOT NULL DEFAULT 0,
      downtime_incidents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (monitor_id, day)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER REFERENCES monitors(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
      severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
      source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
      started_at TEXT NOT NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status_started
      ON incidents(status, started_at DESC);

    CREATE TABLE IF NOT EXISTS incident_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_incident_updates_incident
      ON incident_updates(incident_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS maintenances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed')),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      suppress_alerts INTEGER NOT NULL DEFAULT 1,
      affected_monitor_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('telegram', 'discord', 'webhook')),
      config_json TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
