import { Plus, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type AdminMonitor,
  type IncidentItem,
  type IncidentSeverity,
  type IncidentStatus,
} from '../../api/client';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime, INCIDENT_SEVERITY_LABELS } from '../../lib/format';

export function IncidentsView() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [monitors, setMonitors] = useState<AdminMonitor[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [monitorId, setMonitorId] = useState('');
  const [status, setStatus] = useState<IncidentStatus>('investigating');
  const [severity, setSeverity] = useState<IncidentSeverity>('minor');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [updateDrafts, setUpdateDrafts] = useState<
    Record<number, { status: IncidentStatus; message: string }>
  >({});

  const loadData = useCallback(async () => {
    try {
      const [incRes, monRes] = await Promise.all([
        api.getIncidents(),
        api.getMonitors(),
      ]);
      setIncidents(incRes.incidents);
      setMonitors(monRes.monitors);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createIncident({
        title: title.trim(),
        monitorId: monitorId ? Number(monitorId) : null,
        status,
        severity,
        message: message.trim(),
      });
      setModalOpen(false);
      setTitle('');
      setMonitorId('');
      setStatus('investigating');
      setSeverity('minor');
      setMessage('');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Olay oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePostUpdate(e: FormEvent, inc: IncidentItem) {
    e.preventDefault();
    const draft = updateDrafts[inc.id];
    if (!draft || !draft.message.trim()) return;
    await api.addIncidentUpdate(inc.id, draft.status, draft.message.trim());
    setUpdateDrafts((prev) => {
      const copy = { ...prev };
      delete copy[inc.id];
      return copy;
    });
    await loadData();
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Bu olay kaydını silmek istediğinize emin misiniz?')) return;
    await api.deleteIncident(id);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            Olaylar & Kesinti Günlüğü
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Otomatik kesintileri izleyin ve Public Status Page için manuel durum güncellemeleri yayınlayın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition"
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
          <span>Manuel Olay Aç</span>
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Yükleniyor...
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Henüz kayıtlı bir olay bulunmuyor.
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => {
            const draft = updateDrafts[inc.id] ?? {
              status: inc.status === 'resolved' ? 'resolved' : 'identified',
              message: '',
            };
            return (
              <article
                key={inc.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                        {inc.title}
                      </h2>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                        {inc.source === 'auto' ? 'Otomatik' : 'Manuel'}
                      </span>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                        {INCIDENT_SEVERITY_LABELS[inc.severity] ?? inc.severity}
                      </span>
                    </div>
                    <p className="font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                      Başlangıç: {formatDateTime(inc.startedAt)}
                      {inc.monitorName ? ` · Servis: ${inc.monitorName}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge variant={inc.status} />
                    <button
                      type="button"
                      onClick={() => void handleDelete(inc.id)}
                      aria-label="Olayı sil"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[#F87171]"
                    >
                      <Trash size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  {inc.updates.map((u) => (
                    <div key={u.id} className="flex flex-col gap-1 sm:flex-row sm:gap-3 text-sm">
                      <div className="shrink-0 sm:w-36">
                        <StatusBadge variant={u.status} />
                      </div>
                      <div>
                        <p className="text-[var(--color-foreground)]">{u.message}</p>
                        <span className="font-mono-tabular text-[11px] text-[var(--color-muted-foreground)]">
                          {formatDateTime(u.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Update Form */}
                <form
                  onSubmit={(e) => void handlePostUpdate(e, inc)}
                  className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 sm:flex-row"
                >
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setUpdateDrafts((prev) => ({
                        ...prev,
                        [inc.id]: {
                          ...draft,
                          status: e.target.value as IncidentStatus,
                        },
                      }))
                    }
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs sm:w-40"
                  >
                    <option value="investigating">İnceleniyor</option>
                    <option value="identified">Tespit Edildi</option>
                    <option value="monitoring">İzleniyor</option>
                    <option value="resolved">Çözüldü</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={draft.message}
                    onChange={(e) =>
                      setUpdateDrafts((prev) => ({
                        ...prev,
                        [inc.id]: { ...draft, message: e.target.value },
                      }))
                    }
                    placeholder="Durum güncellemesi yazın..."
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3.5 py-2 text-xs font-semibold text-[var(--color-foreground)] hover:brightness-110"
                  >
                    Güncelleme Ekle
                  </button>
                </form>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Yeni Manuel Olay Oluştur"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] px-3 py-2 text-xs text-[#F87171]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
              Olay Başlığı
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Avrupa Bölgesi Yavaşlama"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                İlgili Servis (Ops.)
              </label>
              <select
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">Genel / Seçimsiz</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Başlangıç Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as IncidentStatus)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="investigating">İnceleniyor</option>
                <option value="identified">Tespit Edildi</option>
                <option value="monitoring">İzleniyor</option>
                <option value="resolved">Çözüldü</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Önem Derecesi
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="minor">Düşük</option>
                <option value="major">Orta</option>
                <option value="critical">Kritik</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
              Durum Mesajı
            </label>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Sorunla ilgili ilk gözlemleri paylaşın..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)]"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {saving ? 'Yayınlanıyor...' : 'Olayı Yayınla'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
