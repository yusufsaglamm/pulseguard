import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().trim().min(1).default('./data'),
  ADMIN_EMAIL: z.string().trim().email().optional().or(z.literal('')),
  ADMIN_PASSWORD: z.string().min(8).optional().or(z.literal('')),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ALLOW_PRIVATE_TARGETS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CHECK_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export interface AppConfig {
  port: number;
  dataDir: string;
  adminEmail?: string;
  adminPassword?: string;
  cookieSecure: boolean;
  allowPrivateTargets: boolean;
  checkRetentionDays: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    adminEmail: parsed.ADMIN_EMAIL || undefined,
    adminPassword: parsed.ADMIN_PASSWORD || undefined,
    cookieSecure: parsed.COOKIE_SECURE,
    allowPrivateTargets: parsed.ALLOW_PRIVATE_TARGETS,
    checkRetentionDays: parsed.CHECK_RETENTION_DAYS,
  };
}
