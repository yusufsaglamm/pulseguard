import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config.js';
import { createRequireAdmin, type AppVariables } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { LoginRateLimiter } from '../auth/rate-limit.js';
import {
  createSession,
  deleteSession,
  SESSION_COOKIE_NAME,
  validateSession,
} from '../auth/session.js';
import {
  changePasswordSchema,
  loginSchema,
  setupSchema,
} from '../schemas/validation.js';

export function createAuthRoutes(db: DatabaseSync, config: AppConfig) {
  const app = new Hono<{ Variables: AppVariables }>();
  const limiter = new LoginRateLimiter(10, 15 * 60 * 1000);
  const requireAdmin = createRequireAdmin(db);

  function setSessionCookie(c: Parameters<typeof setCookie>[0], rawToken: string) {
    setCookie(c, SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: config.cookieSecure,
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  app.get('/me', (c) => {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as {
      count: number;
    };
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const user = validateSession(db, token);
    return c.json({
      authenticated: Boolean(user),
      setupRequired: countRow.count === 0,
      user,
    });
  });

  app.post('/setup', async (c) => {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as {
      count: number;
    };
    if (countRow.count > 0) {
      return c.json({ error: 'Yönetici hesabı zaten oluşturulmuş.' }, 403);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz giriş verisi.' },
        400,
      );
    }

    const email = parsed.data.email.toLowerCase();
    const passwordHash = hashPassword(parsed.data.password);
    const now = new Date().toISOString();

    const res = db
      .prepare('INSERT INTO admin_users (email, password_hash, created_at) VALUES (?, ?, ?)')
      .run(email, passwordHash, now);
    const userId = Number(res.lastInsertRowid);
    const { rawToken } = createSession(db, userId);
    setSessionCookie(c, rawToken);

    return c.json({ user: { id: userId, email } }, 201);
  });

  app.post('/login', async (c) => {
    const clientKey =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local-client';

    if (limiter.isBlocked(clientKey)) {
      return c.json(
        { error: 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.' },
        429,
      );
    }

    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz e-posta veya parola.' },
        400,
      );
    }

    const email = parsed.data.email.toLowerCase();
    const user = db
      .prepare('SELECT id, email, password_hash FROM admin_users WHERE email = ?')
      .get(email) as { id: number; email: string; password_hash: string } | undefined;

    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      limiter.recordFailure(clientKey);
      return c.json({ error: 'E-posta veya parola hatalı.' }, 401);
    }

    limiter.reset(clientKey);
    const { rawToken } = createSession(db, user.id);
    setSessionCookie(c, rawToken);

    return c.json({ user: { id: user.id, email: user.email } });
  });

  app.post('/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    deleteSession(db, token);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ ok: true });
  });

  app.post('/password', requireAdmin, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz parola verisi.' },
        400,
      );
    }

    const adminUser = c.get('adminUser');
    const row = db
      .prepare('SELECT id, password_hash FROM admin_users WHERE id = ?')
      .get(adminUser.id) as { id: number; password_hash: string } | undefined;

    if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
      return c.json({ error: 'Mevcut parola hatalı.' }, 400);
    }

    const nextHash = hashPassword(parsed.data.newPassword);
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(nextHash, row.id);
    return c.json({ ok: true });
  });

  return app;
}
