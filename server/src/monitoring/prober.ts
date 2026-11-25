import { createConnection } from 'node:net';
import { performance } from 'node:perf_hooks';
import { parseTcpTarget } from '../schemas/validation.js';

export interface MonitorRecord {
  id: number;
  name: string;
  type: 'http' | 'api' | 'tcp';
  target: string;
  method: string;
  headers_json: string;
  expected_status: number | null;
  expected_keyword: string | null;
  interval_sec: number;
  timeout_ms: number;
  failure_threshold: number;
  is_public: number;
  is_active: number;
  status: 'up' | 'down' | 'unknown';
  consecutive_failures: number;
  last_checked_at: string | null;
  last_latency_ms: number | null;
  last_error: string | null;
}

export interface ProbeResult {
  isUp: boolean;
  statusCode: number | null;
  latencyMs: number;
  errorMessage: string | null;
}

function parseHeadersJson(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        headers[k] = v;
      }
    }
    return headers;
  } catch {
    return {};
  }
}

export async function probeHttp(
  monitor: Pick<
    MonitorRecord,
    'target' | 'method' | 'headers_json' | 'expected_status' | 'expected_keyword' | 'timeout_ms'
  >,
): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const headers = parseHeadersJson(monitor.headers_json);
    const response = await fetch(monitor.target, {
      method: monitor.method || 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(monitor.timeout_ms),
    });

    const bodyText =
      monitor.expected_keyword && monitor.method !== 'HEAD' ? await response.text() : '';
    const latencyMs = Math.max(1, Math.round(performance.now() - start));

    const statusOk =
      monitor.expected_status !== null
        ? response.status === monitor.expected_status
        : response.status >= 200 && response.status < 300;

    if (!statusOk) {
      const expectedDesc =
        monitor.expected_status !== null ? String(monitor.expected_status) : '2xx';
      return {
        isUp: false,
        statusCode: response.status,
        latencyMs,
        errorMessage: `Beklenen durum kodu ${expectedDesc}, gelen ${response.status}`,
      };
    }

    if (monitor.expected_keyword && !bodyText.includes(monitor.expected_keyword)) {
      return {
        isUp: false,
        statusCode: response.status,
        latencyMs,
        errorMessage: `Yanıt gövdesinde beklenen ifade bulunamadı: "${monitor.expected_keyword}"`,
      };
    }

    return {
      isUp: true,
      statusCode: response.status,
      latencyMs,
      errorMessage: null,
    };
  } catch (err) {
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const message =
      err instanceof Error
        ? err.name === 'TimeoutError' || err.name === 'AbortError'
          ? `Zaman aşımı (${monitor.timeout_ms} ms)`
          : err.message
        : 'Bilinmeyen bağlantı hatası';
    return {
      isUp: false,
      statusCode: null,
      latencyMs,
      errorMessage: message,
    };
  }
}

export async function probeTcp(
  monitor: Pick<MonitorRecord, 'target' | 'timeout_ms'>,
): Promise<ProbeResult> {
  const parsed = parseTcpTarget(monitor.target);
  if (!parsed) {
    return {
      isUp: false,
      statusCode: null,
      latencyMs: 0,
      errorMessage: 'Geçersiz TCP hedef formatı',
    };
  }

  const start = performance.now();
  return new Promise<ProbeResult>((resolve) => {
    let settled = false;
    const socket = createConnection({ host: parsed.host, port: parsed.port });
    socket.setTimeout(monitor.timeout_ms);

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => {
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      finish({
        isUp: true,
        statusCode: null,
        latencyMs,
        errorMessage: null,
      });
    });

    socket.once('timeout', () => {
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      finish({
        isUp: false,
        statusCode: null,
        latencyMs,
        errorMessage: `TCP bağlantı zaman aşımı (${monitor.timeout_ms} ms)`,
      });
    });

    socket.once('error', (err) => {
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      finish({
        isUp: false,
        statusCode: null,
        latencyMs,
        errorMessage: err.message || 'TCP bağlantı hatası',
      });
    });
  });
}

export async function probeMonitor(monitor: MonitorRecord): Promise<ProbeResult> {
  if (monitor.type === 'tcp') {
    return probeTcp(monitor);
  }
  return probeHttp(monitor);
}
