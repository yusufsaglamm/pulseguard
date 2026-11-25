import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import { createRequireAdmin, type AppVariables } from './auth/middleware.js';
import type { MonitorScheduler } from './monitoring/scheduler.js';
import type { NotificationDispatcher } from './notifications/dispatcher.js';
import { createAuthRoutes } from './routes/auth.js';
import { createChannelRoutes } from './routes/channels.js';
import { createIncidentRoutes } from './routes/incidents.js';
import { createMaintenanceRoutes } from './routes/maintenances.js';
import { createMonitorRoutes } from './routes/monitors.js';
import { createPublicRoutes } from './routes/public.js';
import { createSettingsRoutes } from './routes/settings.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export interface CreateAppOptions {
  db: DatabaseSync;
  config: AppConfig;
  scheduler: MonitorScheduler;
  dispatcher: NotificationDispatcher;
  webDistDir?: string;
}

export function createApp(options: CreateAppOptions) {
  const { db, config, scheduler, dispatcher } = options;
  const app = new Hono();

  app.onError((err, c) => {
    console.error('[PulseGuard API Error]', err.message);
    return c.json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' }, 500);
  });

  app.use('/api/auth/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.use('/api/admin/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.route('/api', createPublicRoutes(db));
  app.route('/api/auth', createAuthRoutes(db, config));

  const admin = new Hono<{ Variables: AppVariables }>();
  admin.use('*', createRequireAdmin(db));
  admin.route('/monitors', createMonitorRoutes(db, config, scheduler));
  admin.route('/incidents', createIncidentRoutes(db));
  admin.route('/maintenances', createMaintenanceRoutes(db));
  admin.route('/channels', createChannelRoutes(db, dispatcher));
  admin.route('/settings', createSettingsRoutes(db));
  app.route('/api/admin', admin);

  const defaultDist = resolve(import.meta.dirname, '../../web/dist');
  const webDistDir = resolve(options.webDistDir ?? defaultDist);
  const indexHtmlPath = join(webDistDir, 'index.html');

  if (existsSync(indexHtmlPath)) {
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api')) {
        return c.json({ error: 'Uç nokta bulunamadı.' }, 404);
      }

      const rel = c.req.path.replace(/^\/+/, '');
      const candidate = resolve(webDistDir, rel);
      const insideDist =
        candidate === webDistDir || candidate.startsWith(webDistDir + sep);

      if (insideDist && rel.length > 0 && existsSync(candidate)) {
        const st = statSync(candidate);
        if (st.isFile()) {
          const ext = extname(candidate).toLowerCase();
          const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
          const body = readFileSync(candidate);
          return c.body(body, 200, { 'Content-Type': contentType });
        }
      }

      const html = readFileSync(indexHtmlPath);
      return c.body(html, 200, { 'Content-Type': 'text/html; charset=utf-8' });
    });
  }

  return app;
}
