import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;

/**
 * Hashes a plaintext password using scrypt with a per-password 16-byte random salt.
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` string in constant time.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(plain, salt, KEY_LEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
