import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { ensureDefaults } from './db/seed.js';
import { MonitorScheduler } from './monitoring/scheduler.js';
import { NotificationDispatcher } from './notifications/dispatcher.js';

const config = loadConfig();
const dbPath = join(resolve(config.dataDir), 'pulseguard.db');
const db = openDatabase(dbPath);
runMigrations(db);
ensureDefaults(db, config);

const dispatcher = new NotificationDispatcher(db);
const scheduler = new MonitorScheduler(db, dispatcher, config.checkRetentionDays);
scheduler.start();

const app = createApp({ db, config, scheduler, dispatcher });

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`[PulseGuard] Sunucu http://0.0.0.0:${info.port} üzerinde çalışıyor`);
  },
);

function shutdown(signal: string) {
  console.log(`[PulseGuard] ${signal} alındı, kapatılıyor...`);
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
