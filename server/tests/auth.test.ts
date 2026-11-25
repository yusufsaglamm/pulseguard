import { describe, it, expect } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import {
  createSession,
  deleteSession,
  pruneExpiredSessions,
  validateSession,
} from '../src/auth/session.js';
import { LoginRateLimiter } from '../src/auth/rate-limit.js';
import { createMonitorInputSchema } from '../src/schemas/validation.js';

describe('password hashing & verification', () => {
  it('hashes with unique random salt and verifies in constant time', () => {
    const h1 = hashPassword('StrongPass!2026');
    const h2 = hashPassword('StrongPass!2026');

    expect(h1).not.toBe(h2);
    expect(verifyPassword('StrongPass!2026', h1)).toBe(true);
    expect(verifyPassword('wrong-password', h1)).toBe(false);
    expect(verifyPassword('StrongPass!2026', 'malformed')).toBe(false);
  });
});

describe('session management', () => {
  it('creates, validates, expires, and deletes sessions', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const now = Date.UTC(2026, 10, 25, 12, 0, 0);
    const userRes = db
      .prepare('INSERT INTO admin_users (email, password_hash, created_at) VALUES (?, ?, ?)')
      .run('admin@pulseguard.local', hashPassword('pass12345'), new Date(now).toISOString());
    const userId = Number(userRes.lastInsertRowid);

    const { rawToken } = createSession(db, userId, now);
    expect(validateSession(db, rawToken, now + 1000)).toEqual({
      id: userId,
      email: 'admin@pulseguard.local',
    });

    // Expired after 7 days + 1ms
    const expiredAt = now + 7 * 24 * 60 * 60 * 1000 + 1;
    expect(validateSession(db, rawToken, expiredAt)).toBeNull();

    // New session deletion
    const second = createSession(db, userId, now);
    deleteSession(db, second.rawToken);
    expect(validateSession(db, second.rawToken, now + 1000)).toBeNull();

    // Prune expired
    createSession(db, userId, now);
    expect(pruneExpiredSessions(db, expiredAt)).toBe(1);
  });
});

describe('login rate limiter', () => {
  it('blocks after max failed attempts and resets on success or window expiry', () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    const t0 = 1_000_000;

    expect(limiter.isBlocked('1.2.3.4', t0)).toBe(false);
    limiter.recordFailure('1.2.3.4', t0);
    limiter.recordFailure('1.2.3.4', t0 + 100);
    expect(limiter.isBlocked('1.2.3.4', t0 + 200)).toBe(false);
    limiter.recordFailure('1.2.3.4', t0 + 200);
    expect(limiter.isBlocked('1.2.3.4', t0 + 300)).toBe(true);

    // After window passes
    expect(limiter.isBlocked('1.2.3.4', t0 + 61_000)).toBe(false);

    // Reset on login success
    limiter.recordFailure('5.6.7.8', t0);
    limiter.recordFailure('5.6.7.8', t0);
    limiter.recordFailure('5.6.7.8', t0);
    expect(limiter.isBlocked('5.6.7.8', t0 + 10)).toBe(true);
    limiter.reset('5.6.7.8');
    expect(limiter.isBlocked('5.6.7.8', t0 + 20)).toBe(false);
  });
});

describe('monitor validation', () => {
  it('enforces private target toggle for http and tcp monitors', () => {
    const strictSchema = createMonitorInputSchema(false);
    const permissiveSchema = createMonitorInputSchema(true);

    expect(
      strictSchema.safeParse({ name: 'Local', type: 'http', target: 'http://127.0.0.1:3000' }).success,
    ).toBe(false);
    expect(
      permissiveSchema.safeParse({ name: 'Local', type: 'http', target: 'http://127.0.0.1:3000' }).success,
    ).toBe(true);
    expect(
      strictSchema.safeParse({ name: 'Public', type: 'tcp', target: '8.8.8.8:443' }).success,
    ).toBe(true);
    expect(
      permissiveSchema.safeParse({ name: 'BadTCP', type: 'tcp', target: 'host:99999' }).success,
    ).toBe(false);
  });
});
