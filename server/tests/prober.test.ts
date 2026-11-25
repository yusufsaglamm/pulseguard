import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { describe, it, expect, afterAll } from 'vitest';
import { probeHttp, probeTcp } from '../src/monitoring/prober.js';

describe('monitoring probers', () => {
  const serversToClose: Array<() => Promise<void>> = [];

  afterAll(async () => {
    await Promise.all(serversToClose.map((fn) => fn()));
  });

  it('probes HTTP/API status codes, keyword checks, and timeouts', async () => {
    const server = createHttpServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"healthy"}');
        return;
      }
      if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('late');
        }, 400);
        return;
      }
      res.writeHead(503);
      res.end('unavailable');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    serversToClose.push(() => new Promise((res) => server.close(() => res())));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Expected address');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const ok = await probeHttp({
      target: `${baseUrl}/ok`,
      method: 'GET',
      headers_json: '{}',
      expected_status: null,
      expected_keyword: 'healthy',
      timeout_ms: 2000,
    });
    expect(ok.isUp).toBe(true);
    expect(ok.statusCode).toBe(200);
    expect(ok.latencyMs).toBeGreaterThanOrEqual(1);

    const missingKeyword = await probeHttp({
      target: `${baseUrl}/ok`,
      method: 'GET',
      headers_json: '{}',
      expected_status: 200,
      expected_keyword: 'missing-token',
      timeout_ms: 2000,
    });
    expect(missingKeyword.isUp).toBe(false);
    expect(missingKeyword.errorMessage).toContain('missing-token');

    const failStatus = await probeHttp({
      target: `${baseUrl}/err`,
      method: 'GET',
      headers_json: '{}',
      expected_status: null,
      expected_keyword: null,
      timeout_ms: 2000,
    });
    expect(failStatus.isUp).toBe(false);
    expect(failStatus.statusCode).toBe(503);

    const timeoutRes = await probeHttp({
      target: `${baseUrl}/slow`,
      method: 'GET',
      headers_json: '{}',
      expected_status: 200,
      expected_keyword: null,
      timeout_ms: 100,
    });
    expect(timeoutRes.isUp).toBe(false);
    expect(timeoutRes.errorMessage).toContain('Zaman aşımı');
  });

  it('probes open and closed TCP ports', async () => {
    const tcpServer = createNetServer((socket) => {
      socket.end();
    });
    await new Promise<void>((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
    const addr = tcpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Expected tcp address');
    const openPort = addr.port;
    serversToClose.push(() => new Promise((res) => tcpServer.close(() => res())));

    const openRes = await probeTcp({
      target: `127.0.0.1:${openPort}`,
      timeout_ms: 1000,
    });
    expect(openRes.isUp).toBe(true);
    expect(openRes.latencyMs).toBeGreaterThanOrEqual(1);

    await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    const closedRes = await probeTcp({
      target: `127.0.0.1:${openPort}`,
      timeout_ms: 1000,
    });
    expect(closedRes.isUp).toBe(false);
    expect(closedRes.errorMessage).toBeTruthy();
  });
});
