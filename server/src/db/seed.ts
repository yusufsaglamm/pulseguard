import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config.js';
import { hashPassword } from '../auth/password.js';

const DEFAULT_SETTINGS: Array<[string, string]> = [
  ['site_title', 'PulseGuard Servis Durumu'],
  [
    'site_description',
    'Altyapı, web servisleri ve API uç noktalarının anlık çalışma durumu ve son 90 günlük performans geçmişi.',
  ],
];

/**
 * Ensures baseline site settings and optional env-configured admin user exist.
 */
export function ensureDefaults(db: DatabaseSync, config: AppConfig): void {
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );
  for (const [key, value] of DEFAULT_SETTINGS) {
    insertSetting.run(key, value);
  }

  if (config.adminEmail && config.adminPassword) {
    const row = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as {
      count: number;
    };
    if (row.count === 0) {
      const now = new Date().toISOString();
      const hash = hashPassword(config.adminPassword);
      db.prepare(
        'INSERT INTO admin_users (email, password_hash, created_at) VALUES (?, ?, ?)',
      ).run(config.adminEmail.toLowerCase(), hash, now);
    }
  }
}
