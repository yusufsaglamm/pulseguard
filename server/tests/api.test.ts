import { createServer } from 'node:http';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { ensureDefaults } from '../src/db/seed.js';
import { MonitorScheduler } from '../src/monitoring/scheduler.js';
import { NotificationDispatcher } from '../src/notifications/dispatcher.js';

describe('PulseGuard REST API integration', () => {
  const servers: Array<() => Promise<void>> = [];
  let targetBaseUrl = '';

  beforeEach(async () => {
    if (!targetBaseUrl) {
      const srv = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
      const addr = srv.address();
      if (!addr || typeof addr === 'string') throw new Error('Expected address');
      targetBaseUrl = `http://127.0.0.1:${addr.port}`;
      servers.push(() => new Promise((r) => srv.close(() => r())));
    }
  });

  afterAll(async () => {
    await Promise.all(servers.map((fn) => fn()));
  });

  function setupTestApp() {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const config = loadConfig({ ALLOW_PRIVATE_TARGETS: 'true' });
    ensureDefaults(db, config);
    const dispatcher = new NotificationDispatcher(db);
    const scheduler = new MonitorScheduler(db, dispatcher, 30);
    const app = createApp({ db, config, scheduler, dispatcher });
    return { db, app, scheduler };
  }

  it('requires auth for admin endpoints and completes setup -> login -> monitor -> incident -> maintenance -> public status flow', async () => {
    const { app } = setupTestApp();

    // Unauthenticated admin access denied
    const unauth = await app.request('/api/admin/monitors');
    expect(unauth.status).toBe(401);

    // Check setupRequired
    const meBefore = await app.request('/api/auth/me');
    expect(await meBefore.json()).toEqual({
      authenticated: false,
      setupRequired: true,
      user: null,
    });

    // First-run setup creates admin & sets session cookie
    const setupRes = await app.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@pulseguard.local',
        password: 'password1234',
      }),
    });
    expect(setupRes.status).toBe(201);
    const setCookieHeader = setupRes.headers.get('set-cookie');
    expect(setCookieHeader).toContain('pulseguard_session=');
    const cookiePair = setCookieHeader!.split(';')[0]!;

    // Second setup attempt must be forbidden
    const secondSetup = await app.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'other@pulseguard.local',
        password: 'password1234',
      }),
    });
    expect(secondSetup.status).toBe(403);

    // Create monitor
    const createMonitor = await app.request('/api/admin/monitors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
      },
      body: JSON.stringify({
        name: 'Hedef API',
        type: 'api',
        target: targetBaseUrl,
        method: 'GET',
        expectedStatus: 200,
        expectedKeyword: 'ok',
        intervalSec: 60,
        timeoutMs: 3000,
        failureThreshold: 3,
        isPublic: true,
        isActive: true,
      }),
    });
    expect(createMonitor.status).toBe(201);
    const createdMonitor = (await createMonitor.json()) as {
      monitor: { id: number; name: string };
    };

    // Run immediate check & inspect metrics
    const checkRes = await app.request(`/api/admin/monitors/${createdMonitor.monitor.id}/check`, {
      method: 'POST',
      headers: { Cookie: cookiePair },
    });
    expect(checkRes.status).toBe(200);
    const checkBody = (await checkRes.json()) as { monitor: { status: string } };
    expect(checkBody.monitor.status).toBe('up');

    const metricsRes = await app.request(
      `/api/admin/monitors/${createdMonitor.monitor.id}/metrics?range=24h`,
      { headers: { Cookie: cookiePair } },
    );
    expect(metricsRes.status).toBe(200);
    const metricsBody = (await metricsRes.json()) as {
      summary: { totalChecks: number; uptimePct: number };
      points: unknown[];
    };
    expect(metricsBody.summary.totalChecks).toBe(1);
    expect(metricsBody.summary.uptimePct).toBe(100);
    expect(metricsBody.points).toHaveLength(1);

    // Create manual incident and post an update
    const incRes = await app.request('/api/admin/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({
        title: 'API Gecikme Artışı',
        monitorId: createdMonitor.monitor.id,
        status: 'investigating',
        severity: 'minor',
        message: 'Bölgesel ağ yoğunluğu inceleniyor.',
      }),
    });
    expect(incRes.status).toBe(201);
    const { id: incidentId } = (await incRes.json()) as { id: number };

    const updRes = await app.request(`/api/admin/incidents/${incidentId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({
        status: 'identified',
        message: 'Kök neden CDN yönlendirmesi olarak tespit edildi.',
      }),
    });
    expect(updRes.status).toBe(201);

    // Create planned maintenance
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();
    const maintRes = await app.request('/api/admin/maintenances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({
        title: 'Veritabanı Bakımı',
        description: 'Planlı indeks yenileme çalışması',
        status: 'scheduled',
        startsAt,
        endsAt,
        suppressAlerts: true,
        affectedMonitorIds: [createdMonitor.monitor.id],
      }),
    });
    expect(maintRes.status).toBe(201);

    // Create Telegram channel and ensure secret is redacted in GET and absent in public status
    const chRes = await app.request('/api/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({
        name: 'Telegram',
        type: 'telegram',
        isEnabled: true,
        config: { botToken: '99999:SUPERSECRET', chatId: '-100123' },
      }),
    });
    expect(chRes.status).toBe(201);

    const chList = await app.request('/api/admin/channels', {
      headers: { Cookie: cookiePair },
    });
    const chListText = await chList.text();
    expect(chListText).not.toContain('SUPERSECRET');
    expect(chListText).toContain('***CRET');

    // Public status page payload
    const publicRes = await app.request('/api/public/status');
    expect(publicRes.status).toBe(200);
    const publicText = await publicRes.text();
    expect(publicText).not.toContain('SUPERSECRET');
    const publicData = JSON.parse(publicText) as {
      overallStatus: string;
      monitors: Array<{ name: string; days90: unknown[]; uptime90d: number }>;
      incidents: Array<{ title: string; status: string; updates: unknown[] }>;
      maintenances: Array<{ title: string }>;
    };

    expect(publicData.overallStatus).toBe('partial_outage');
    expect(publicData.monitors).toHaveLength(1);
    expect(publicData.monitors[0]?.days90).toHaveLength(90);
    expect(publicData.monitors[0]?.uptime90d).toBe(100);
    expect(publicData.incidents).toHaveLength(1);
    expect(publicData.incidents[0]?.status).toBe('identified');
    expect(publicData.incidents[0]?.updates).toHaveLength(2);
    expect(publicData.maintenances).toHaveLength(1);
  });
});
