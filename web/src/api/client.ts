export type MonitorType = 'http' | 'api' | 'tcp';
export type MonitorStatus = 'up' | 'down' | 'unknown';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'minor' | 'major' | 'critical';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed';
export type ChannelType = 'telegram' | 'discord' | 'webhook';

export interface DayStat90 {
  day: string;
  status: 'up' | 'degraded' | 'down' | 'no_data';
  uptimePct: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
  downtimeIncidents: number;
}

export interface PublicMonitor {
  id: number;
  name: string;
  type: MonitorType;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  uptime90d: number | null;
  avgLatency90d: number | null;
  days90: DayStat90[];
}

export interface IncidentUpdate {
  id: number;
  status: IncidentStatus;
  message: string;
  createdAt: string;
}

export interface IncidentItem {
  id: number;
  monitorId: number | null;
  monitorName: string | null;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  source: 'auto' | 'manual';
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface MaintenanceItem {
  id: number;
  title: string;
  description: string;
  status: MaintenanceStatus;
  startsAt: string;
  endsAt: string;
  suppressAlerts?: boolean;
  affectedMonitorIds: number[];
}

export interface PublicStatusResponse {
  site: {
    title: string;
    description: string;
  };
  overallStatus: 'operational' | 'partial_outage' | 'major_outage' | 'maintenance';
  generatedAt: string;
  monitors: PublicMonitor[];
  incidents: IncidentItem[];
  maintenances: MaintenanceItem[];
}

export interface AdminMonitor {
  id: number;
  name: string;
  type: MonitorType;
  target: string;
  method: 'GET' | 'POST' | 'HEAD' | 'PUT' | 'OPTIONS';
  headers: Record<string, string>;
  expectedStatus: number | null;
  expectedKeyword: string | null;
  intervalSec: number;
  timeoutMs: number;
  failureThreshold: number;
  isPublic: boolean;
  isActive: boolean;
  status: MonitorStatus;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
}

export interface MonitorMetricsResponse {
  range: '24h' | '7d' | '30d';
  summary: {
    totalChecks: number;
    uptimePct: number | null;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    minLatencyMs: number | null;
    maxLatencyMs: number | null;
  };
  points: Array<{
    checkedAt: string;
    latencyMs: number;
    isUp: boolean;
    statusCode: number | null;
  }>;
  recentChecks: Array<{
    id: number;
    isUp: boolean;
    statusCode: number | null;
    latencyMs: number;
    errorMessage: string | null;
    checkedAt: string;
  }>;
}

export interface NotificationChannel {
  id: number;
  name: string;
  type: ChannelType;
  isEnabled: boolean;
  config: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  setupRequired: boolean;
  user: { id: number; email: string } | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.error === 'string' ? data.error : `İstek başarısız (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  getPublicStatus: () => request<PublicStatusResponse>('/api/public/status'),

  getMe: () => request<AuthMeResponse>('/api/auth/me'),
  setup: (email: string, password: string) =>
    request<{ user: { id: number; email: string } }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: { id: number; email: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getMonitors: () => request<{ monitors: AdminMonitor[] }>('/api/admin/monitors'),
  createMonitor: (payload: Record<string, unknown>) =>
    request<{ monitor: AdminMonitor }>('/api/admin/monitors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMonitor: (id: number, payload: Record<string, unknown>) =>
    request<{ monitor: AdminMonitor }>(`/api/admin/monitors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteMonitor: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/monitors/${id}`, { method: 'DELETE' }),
  checkMonitorNow: (id: number) =>
    request<{ monitor: AdminMonitor }>(`/api/admin/monitors/${id}/check`, {
      method: 'POST',
    }),
  getMonitorMetrics: (id: number, range: '24h' | '7d' | '30d') =>
    request<MonitorMetricsResponse>(`/api/admin/monitors/${id}/metrics?range=${range}`),

  getIncidents: () => request<{ incidents: IncidentItem[] }>('/api/admin/incidents'),
  createIncident: (payload: Record<string, unknown>) =>
    request<{ id: number }>('/api/admin/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  addIncidentUpdate: (id: number, status: IncidentStatus, message: string) =>
    request<{ ok: boolean }>(`/api/admin/incidents/${id}/updates`, {
      method: 'POST',
      body: JSON.stringify({ status, message }),
    }),
  deleteIncident: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/incidents/${id}`, { method: 'DELETE' }),

  getMaintenances: () =>
    request<{ maintenances: MaintenanceItem[] }>('/api/admin/maintenances'),
  createMaintenance: (payload: Record<string, unknown>) =>
    request<{ maintenance: MaintenanceItem }>('/api/admin/maintenances', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMaintenance: (id: number, payload: Record<string, unknown>) =>
    request<{ maintenance: MaintenanceItem }>(`/api/admin/maintenances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteMaintenance: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/maintenances/${id}`, { method: 'DELETE' }),

  getChannels: () => request<{ channels: NotificationChannel[] }>('/api/admin/channels'),
  createChannel: (payload: Record<string, unknown>) =>
    request<{ channel: NotificationChannel }>('/api/admin/channels', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateChannel: (id: number, payload: Record<string, unknown>) =>
    request<{ channel: NotificationChannel }>(`/api/admin/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteChannel: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/channels/${id}`, { method: 'DELETE' }),
  testChannel: (id: number) =>
    request<{ ok: boolean; error?: string }>(`/api/admin/channels/${id}/test`, {
      method: 'POST',
    }),

  getSettings: () =>
    request<{ site_title: string; site_description: string }>('/api/admin/settings'),
  updateSettings: (payload: { site_title: string; site_description: string }) =>
    request<{ site_title: string; site_description: string }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
