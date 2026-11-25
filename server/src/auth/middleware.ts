import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { DatabaseSync } from 'node:sqlite';
import { SESSION_COOKIE_NAME, validateSession, type SessionUser } from './session.js';

export type AppVariables = {
  adminUser: SessionUser;
};

export function createRequireAdmin(db: DatabaseSync): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const user = validateSession(db, token);
    if (!user) {
      return c.json({ error: 'Bu işlem için yönetici oturumu gereklidir.' }, 401);
    }
    c.set('adminUser', user);
    await next();
  };
}
