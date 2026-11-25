import {
  PencilSimple,
  Play,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type AdminMonitor,
  type MonitorMetricsResponse,
  type MonitorType,
} from '../../api/client';
import { LatencyChart } from '../../components/LatencyChart';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';

interface MonitorFormState {
  name: string;
  type: MonitorType;
  target: string;
  method: 'GET' | 'POST' | 'HEAD' | 'PUT' | 'OPTIONS';
  headersText: string;
  expectedStatus: string;
  expectedKeyword: string;
  intervalSec: string;
  timeoutMs: string;
  failureThreshold: string;
  isPublic: boolean;
  isActive: boolean;
}

const DEFAULT_FORM: MonitorFormState = {
  name: '',
  type: 'http',
  target: 'https://',
  method: 'GET',
  headersText: '',
  expectedStatus: '',
  expectedKeyword: '',
  intervalSec: '60',
  timeoutMs: '10000',
  failureThreshold: '3',
  isPublic: true,
  isActive: true,
};

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function textToHeaders(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

export function MonitorsView() {
  const [monitors, setMonitors] = useState<AdminMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [metrics, setMetrics] = useState<MonitorMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MonitorFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMonitors = useCallback(async () => {
    try {
      const res = await api.getMonitors();
      setMonitors(res.monitors);
      setLoadError(null);
      setSelectedId((prev) => {
        if (prev && res.monitors.some((m) => m.id === prev)) return prev;
        return res.monitors[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : 'Monitörler yüklenemedi.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async (id: number, r: '24h' | '7d' | '30d') => {
    setMetricsLoading(true);
    try {
      const res = await api.getMonitorMetrics(id, r);
      setMetrics(res);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonitors();
  }, [loadMonitors]);

  useEffect(() => {
    if (selectedId !== null) {
      void loadMetrics(selectedId, range);
    } else {
      setMetrics(null);
    }
  }, [selectedId, range, loadMetrics]);

  function openCreateModal() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(m: AdminMonitor) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      type: m.type,
      target: m.target,
      method: m.method,
      headersText: headersToText(m.headers),
      expectedStatus: m.expectedStatus !== null ? String(m.expectedStatus) : '',
      expectedKeyword: m.expectedKeyword ?? '',
      intervalSec: String(m.intervalSec),
      timeoutMs: String(m.timeoutMs),
      failureThreshold: String(m.failureThreshold),
      isPublic: m.isPublic,
      isActive: m.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        target: form.target.trim(),
        method: form.method,
        headers: textToHeaders(form.headersText),
        expectedStatus: form.expectedStatus.trim()
          ? Number(form.expectedStatus.trim())
          : null,
        expectedKeyword: form.expectedKeyword.trim() || null,
        intervalSec: Number(form.intervalSec),
        timeoutMs: Number(form.timeoutMs),
        failureThreshold: Number(form.failureThreshold),
        isPublic: form.isPublic,
        isActive: form.isActive,
      };
      if (editingId !== null) {
        await api.updateMonitor(editingId, payload);
      } else {
        const created = await api.createMonitor(payload);
        setSelectedId(created.monitor.id);
      }
      setModalOpen(false);
      await loadMonitors();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Monitör kaydedilemedi.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRunCheck(id: number) {
    setCheckingId(id);
    try {
      await api.checkMonitorNow(id);
      await loadMonitors();
      if (selectedId === id) {
        await loadMetrics(id, range);
      }
    } finally {
      setCheckingId(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`"${name}" monitörünü silmek istediğinize emin misiniz?`)) return;
    await api.deleteMonitor(id);
    await loadMonitors();
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedId) ?? null;
  const upCount = monitors.filter((m) => m.status === 'up').length;
  const downCount = monitors.filter((m) => m.status === 'down').length;
  const latencies = monitors
    .map((m) => m.lastLatencyMs)
    .filter((v): v is number => v !== null);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            Monitörler
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Web siteleri, API uç noktaları ve TCP portlarını periyodik olarak izleyin.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition"
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
          <span>Yeni Monitör</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-muted-foreground)]">Toplam Monitör</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[var(--color-foreground)]">
            {monitors.length}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-muted-foreground)]">Çalışıyor (Up)</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[var(--color-secondary)]">
            {upCount}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-muted-foreground)]">Kesinti (Down)</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[#F87171]">
            {downCount}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-muted-foreground)]">Ort. Yanıt Süresi</div>
          <div className="mt-1 font-mono-tabular text-2xl font-semibold text-[var(--color-foreground)]">
            {avgLatency !== null ? `${avgLatency} ms` : '—'}
          </div>
        </div>
      </div>

      {/* Monitors List */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Yükleniyor...
          </div>
        ) : loadError ? (
          <div className="p-6 text-center text-sm text-[#F87171]">
            {loadError}
          </div>
        ) : monitors.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Henüz monitör eklenmedi. İlk servisinizi eklemek için “Yeni Monitör” butonuna tıklayın.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-3 py-3 font-medium">Servis</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Durum</th>
                  <th className="px-3 py-3 font-medium">Hedef</th>
                  <th className="hidden md:table-cell px-3 py-3 font-medium whitespace-nowrap">Sıklık</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Latency</th>
                  <th className="px-3 py-3 font-medium text-right whitespace-nowrap">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {monitors.map((m) => {
                  const selected = m.id === selectedId;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={`cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]'
                          : 'hover:bg-[var(--color-muted)]/60'
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-medium text-[var(--color-foreground)]">
                            {m.name}
                          </span>
                          <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-mono-tabular text-[10px] uppercase text-[var(--color-muted-foreground)]">
                            {m.type}
                          </span>
                          {!m.isActive && (
                            <span className="text-[11px] text-[var(--color-muted-foreground)]">
                              (Pasif)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge variant={m.status} />
                      </td>
                      <td className="px-3 py-3 font-mono-tabular text-xs text-[var(--color-muted-foreground)] max-w-[150px] md:max-w-[220px] truncate">
                        {m.target}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 font-mono-tabular text-xs text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {m.intervalSec} sn
                      </td>
                      <td className="px-3 py-3 font-mono-tabular text-xs text-[var(--color-foreground)] whitespace-nowrap">
                        {m.lastLatencyMs !== null ? `${m.lastLatencyMs} ms` : '—'}
                      </td>
                      <td
                        className="px-3 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={checkingId === m.id}
                            onClick={() => void handleRunCheck(m.id)}
                            title="Şimdi Kontrol Et"
                            aria-label={`${m.name} şimdi kontrol et`}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 text-xs font-medium text-[var(--color-foreground)] hover:brightness-110 disabled:opacity-50"
                          >
                            <Play size={13} weight="fill" aria-hidden="true" />
                            <span className="hidden sm:inline">
                              {checkingId === m.id ? 'Kontrol...' : 'Test'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            title="Düzenle"
                            aria-label={`${m.name} düzenle`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                          >
                            <PencilSimple size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(m.id, m.name)}
                            title="Sil"
                            aria-label={`${m.name} sil`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[#F87171]"
                          >
                            <Trash size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Monitor Metrics & Latency Chart */}
      {selectedMonitor && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                {selectedMonitor.name} — Yanıt Süresi Grafiği
              </h2>
              <p className="font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                {selectedMonitor.target} · Eşik: {selectedMonitor.failureThreshold} hata ·
                Ardışık hata: {selectedMonitor.consecutiveFailures}
              </p>
            </div>
            {selectedMonitor.lastError && (
              <span className="rounded-md border border-[color-mix(in_srgb,var(--color-destructive)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-2.5 py-1 text-xs text-[#F87171]">
                Son hata: {selectedMonitor.lastError}
              </span>
            )}
          </div>

          <LatencyChart
            metrics={metrics}
            loading={metricsLoading}
            range={range}
            onRangeChange={setRange}
          />

          {metrics && metrics.recentChecks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Son Kontroller
              </h3>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Zaman</th>
                      <th className="px-3 py-2 font-medium">Sonuç</th>
                      <th className="px-3 py-2 font-medium">Kod</th>
                      <th className="px-3 py-2 font-medium">Süre</th>
                      <th className="px-3 py-2 font-medium">Detay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {metrics.recentChecks.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-mono-tabular text-[var(--color-muted-foreground)]">
                          {formatDateTime(c.checkedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={c.isUp ? 'up' : 'down'} />
                        </td>
                        <td className="px-3 py-2 font-mono-tabular">
                          {c.statusCode ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono-tabular">{c.latencyMs} ms</td>
                        <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                          {c.errorMessage ?? 'Başarılı'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Create / Edit Monitor Modal */}
      <Modal
        open={modalOpen}
        title={editingId !== null ? 'Monitörü Düzenle' : 'Yeni Monitör Ekle'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] px-3 py-2 text-xs text-[#F87171]">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Servis Adı
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: Ana Web Sitesi"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Kontrol Türü
              </label>
              <select
                value={form.type}
                onChange={(e) => {
                  const nextType = e.target.value as MonitorType;
                  setForm({
                    ...form,
                    type: nextType,
                    target:
                      nextType === 'tcp' && form.target.startsWith('http')
                        ? '127.0.0.1:5432'
                        : nextType !== 'tcp' && !form.target.startsWith('http')
                          ? 'https://'
                          : form.target,
                  });
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="http">Website (HTTP / HTTPS)</option>
                <option value="api">API Endpoint</option>
                <option value="tcp">TCP Port</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
              {form.type === 'tcp' ? 'Hedef (host:port)' : 'Hedef URL'}
            </label>
            <input
              type="text"
              required
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder={
                form.type === 'tcp' ? 'db.ornek.com:5432' : 'https://api.ornek.com/health'
              }
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
            />
          </div>

          {form.type !== 'tcp' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                    HTTP Metot
                  </label>
                  <select
                    value={form.method}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        method: e.target.value as MonitorFormState['method'],
                      })
                    }
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="HEAD">HEAD</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="OPTIONS">OPTIONS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                    Beklenen Status (Ops.)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={599}
                    value={form.expectedStatus}
                    onChange={(e) => setForm({ ...form, expectedStatus: e.target.value })}
                    placeholder="2xx"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                    İçerik Anahtar Kelimesi
                  </label>
                  <input
                    type="text"
                    value={form.expectedKeyword}
                    onChange={(e) => setForm({ ...form, expectedKeyword: e.target.value })}
                    placeholder='"ok"'
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {form.type === 'api' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                    Özel HTTP Header’lar (Her satır: Anahtar: Değer)
                  </label>
                  <textarea
                    rows={2}
                    value={form.headersText}
                    onChange={(e) => setForm({ ...form, headersText: e.target.value })}
                    placeholder="Authorization: Bearer token"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-xs"
                  />
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Sıklık (sn)
              </label>
              <input
                type="number"
                min={10}
                max={3600}
                required
                value={form.intervalSec}
                onChange={(e) => setForm({ ...form, intervalSec: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Zaman Aşımı (ms)
              </label>
              <input
                type="number"
                min={1000}
                max={30000}
                required
                value={form.timeoutMs}
                onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Hata Eşiği
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={form.failureThreshold}
                onChange={(e) => setForm({ ...form, failureThreshold: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span>Public Status Page’de göster</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span>İzleme aktif</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
