import { isIP } from 'node:net';
import { z } from 'zod';

export function isPrivateIpOrHost(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) {
    return true;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (ipVersion === 6) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
    if (host.startsWith('::ffff:')) {
      return isPrivateIpOrHost(host.slice(7));
    }
  }
  return false;
}

export function parseTcpTarget(target: string): { host: string; port: number } | null {
  const trimmed = target.trim();
  let host = '';
  let portStr = '';

  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1 || trimmed[closeIdx + 1] !== ':') return null;
    host = trimmed.slice(1, closeIdx).trim();
    portStr = trimmed.slice(closeIdx + 2).trim();
  } else {
    const lastColon = trimmed.lastIndexOf(':');
    if (lastColon <= 0) return null;
    host = trimmed.slice(0, lastColon).trim();
    portStr = trimmed.slice(lastColon + 1).trim();
    if (host.includes(':')) return null;
  }

  if (!host || !/^\d+$/.test(portStr)) return null;
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

export const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Parola zorunludur.'),
});

export const setupSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(8, 'Parola en az 8 karakter olmalıdır.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut parola zorunludur.'),
  newPassword: z.string().min(8, 'Yeni parola en az 8 karakter olmalıdır.'),
});

const baseMonitorFields = {
  name: z.string().trim().min(1, 'Servis adı zorunludur.').max(120),
  type: z.enum(['http', 'api', 'tcp']),
  target: z.string().trim().min(1, 'Hedef adresi zorunludur.').max(500),
  method: z.enum(['GET', 'POST', 'HEAD', 'PUT', 'OPTIONS']).default('GET'),
  headers: z.record(z.string(), z.string()).default({}),
  expectedStatus: z.number().int().min(100).max(599).nullable().optional().default(null),
  expectedKeyword: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  intervalSec: z.number().int().min(10).max(3600).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  failureThreshold: z.number().int().min(1).max(10).default(3),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
};

export function createMonitorInputSchema(allowPrivateTargets: boolean) {
  return z.object(baseMonitorFields).superRefine((data, ctx) => {
    if (data.type === 'http' || data.type === 'api') {
      let url: URL;
      try {
        url = new URL(data.target);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: 'Geçerli bir HTTP/HTTPS URL girin.',
        });
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: 'Yalnızca http:// veya https:// protokolleri desteklenir.',
        });
        return;
      }
      if (!allowPrivateTargets && isPrivateIpOrHost(url.hostname)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: 'Özel ağ veya localhost hedefleri devre dışı bırakılmıştır.',
        });
      }
    } else if (data.type === 'tcp') {
      const parsed = parseTcpTarget(data.target);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: 'TCP hedefi host:port formatında olmalıdır (ör. db.ornek.com:5432).',
        });
        return;
      }
      if (!allowPrivateTargets && isPrivateIpOrHost(parsed.host)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message: 'Özel ağ veya localhost hedefleri devre dışı bırakılmıştır.',
        });
      }
    }
  });
}

export const incidentStatusEnum = z.enum([
  'investigating',
  'identified',
  'monitoring',
  'resolved',
]);

export const incidentSeverityEnum = z.enum(['minor', 'major', 'critical']);

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1, 'Olay başlığı zorunludur.').max(200),
  monitorId: z.number().int().positive().nullable().optional().default(null),
  status: incidentStatusEnum.default('investigating'),
  severity: incidentSeverityEnum.default('minor'),
  message: z.string().trim().min(1, 'Başlangıç mesajı zorunludur.').max(2000),
});

export const createIncidentUpdateSchema = z.object({
  status: incidentStatusEnum,
  message: z.string().trim().min(1, 'Güncelleme mesajı zorunludur.').max(2000),
});

export const maintenanceStatusEnum = z.enum(['scheduled', 'in_progress', 'completed']);

export const maintenanceSchema = z
  .object({
    title: z.string().trim().min(1, 'Bakım başlığı zorunludur.').max(200),
    description: z.string().trim().max(2000).default(''),
    status: maintenanceStatusEnum.default('scheduled'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    suppressAlerts: z.boolean().default(true),
    affectedMonitorIds: z.array(z.number().int().positive()).default([]),
  })
  .refine((data) => Date.parse(data.endsAt) > Date.parse(data.startsAt), {
    path: ['endsAt'],
    message: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.',
  });

export const telegramConfigSchema = z.object({
  botToken: z.string().trim().min(1, 'Bot token zorunludur.'),
  chatId: z.string().trim().min(1, 'Chat ID zorunludur.'),
});

export const discordConfigSchema = z.object({
  webhookUrl: z.string().trim().url('Geçerli bir Discord Webhook URL girin.'),
});

export const webhookConfigSchema = z.object({
  url: z.string().trim().url('Geçerli bir Webhook URL girin.'),
  secret: z.string().trim().max(256).optional().default(''),
});

export const createChannelSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.literal('telegram'),
    isEnabled: z.boolean().default(true),
    config: telegramConfigSchema,
  }),
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.literal('discord'),
    isEnabled: z.boolean().default(true),
    config: discordConfigSchema,
  }),
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.literal('webhook'),
    isEnabled: z.boolean().default(true),
    config: webhookConfigSchema,
  }),
]);

export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['telegram', 'discord', 'webhook']),
  isEnabled: z.boolean().default(true),
  config: z.record(z.string(), z.string()),
});

export const updateSettingsSchema = z.object({
  site_title: z.string().trim().min(1, 'Site başlığı zorunludur.').max(120),
  site_description: z.string().trim().max(500).default(''),
});
