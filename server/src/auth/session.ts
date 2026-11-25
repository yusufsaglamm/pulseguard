import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const SESSION_COOKIE_NAME = 'pulseguard_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface SessionUser {
  id: number;
  email: string;
}

export function createSession(
  db: DatabaseSync,
  userId: number,
  nowMs: number = Date.now(),
): { rawToken: string; expiresAt: string } {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(userId, tokenHash, expiresAt, createdAt);

  return { rawToken, expiresAt };
}

export function validateSession(
  db: DatabaseSync,
  rawToken: string | undefined,
  nowMs: number = Date.now(),
): SessionUser | null {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.email
       FROM sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | { session_id: number; expires_at: string; user_id: number; email: string }
    | undefined;

  if (!row) return null;
  if (Date.parse(row.expires_at) <= nowMs) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  return { id: row.user_id, email: row.email };
}

export function deleteSession(db: DatabaseSync, rawToken: string | undefined): void {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function pruneExpiredSessions(db: DatabaseSync, nowMs: number = Date.now()): number {
  const nowIso = new Date(nowMs).toISOString();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso);
  return Number(result.changes);
}
