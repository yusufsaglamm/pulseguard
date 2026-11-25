import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type AdminMonitor,
  type MaintenanceItem,
  type MaintenanceStatus,
} from '../../api/client';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MaintenancesView() {
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [monitors, setMonitors] = useState<AdminMonitor[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<MaintenanceStatus>('scheduled');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [suppressAlerts, setSuppressAlerts] = useState(true);
  const [affectedIds, setAffectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [mRes, monRes] = await Promise.all([
        api.getMaintenances(),
        api.getMonitors(),
      ]);
      setItems(mRes.maintenances);
      setMonitors(monRes.monitors);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreate() {
    const start = new Date(Date.now() + 60 * 60_000);
    const end = new Date(Date.now() + 2 * 60 * 60_000);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setStatus('scheduled');
    setStartsAt(toLocalDatetimeInput(start.toISOString()));
    setEndsAt(toLocalDatetimeInput(end.toISOString()));
    setSuppressAlerts(true);
    setAffectedIds([]);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: MaintenanceItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description);
    setStatus(item.status);
    setStartsAt(toLocalDatetimeInput(item.startsAt));
    setEndsAt(toLocalDatetimeInput(item.endsAt));
    setSuppressAlerts(item.suppressAlerts ?? true);
    setAffectedIds(item.affectedMonitorIds);
    setError(null);
    setModalOpen(true);
  }

  function toggleMonitorId(id: number) {
    setAffectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        suppressAlerts,
        affectedMonitorIds: affectedIds,
      };
      if (editingId !== null) {
        await api.updateMaintenance(editingId, payload);
      } else {
        await api.createMaintenance(payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bakım kaydı kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Bu bakım kaydını silmek istediğinize emin misiniz?')) return;
    await api.deleteMaintenance(id);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            Planlı Bakım
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Planlı bakım pencereleri oluşturun ve bakım süresince uyarı bildirimlerini susturun.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition"
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
          <span>Bakım Planla</span>
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Yükleniyor...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Planlanmış bir bakım çalışması bulunmuyor.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                      {item.title}
                    </h2>
                    <StatusBadge variant={item.status} />
                    {item.suppressAlerts && (
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                        Uyarılar Susturulur
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {item.description}
                    </p>
                  )}
                  <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                    <span>Başlangıç: {formatDateTime(item.startsAt)}</span>
                    <span>Bitiş: {formatDateTime(item.endsAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    aria-label="Bakımı düzenle"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  >
                    <PencilSimple size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    aria-label="Bakımı sil"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[#F87171]"
                  >
                    <Trash size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editingId !== null ? 'Planlı Bakımı Düzenle' : 'Yeni Bakım Planla'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] px-3 py-2 text-xs text-[#F87171]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
              Başlık
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Sunucu Çekirdek Güncellemesi"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
              Açıklama
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bakım kapsamı ve tahmini kesinti hakkında bilgi..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Durum
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="scheduled">Planlandı</option>
                <option value="in_progress">Devam Ediyor</option>
                <option value="completed">Tamamlandı</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Başlangıç
              </label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Bitiş
              </label>
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>

          {monitors.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
                Etkilenen Servisler (Boş bırakılırsa tüm servisler)
              </span>
              <div className="flex flex-wrap gap-2">
                {monitors.map((m) => {
                  const checked = affectedIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs cursor-pointer ${
                        checked
                          ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-foreground)]'
                          : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted-foreground)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMonitorId(m.id)}
                        className="accent-[var(--color-primary)]"
                      />
                      <span>{m.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={suppressAlerts}
              onChange={(e) => setSuppressAlerts(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>Bakım penceresi sırasında Down/Up bildirimlerini sustur</span>
          </label>

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
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
