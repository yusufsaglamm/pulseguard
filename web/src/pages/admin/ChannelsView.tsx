import { PaperPlaneTilt, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type ChannelType,
  type NotificationChannel,
} from '../../api/client';
import { Modal } from '../../components/Modal';

export function ChannelsView() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<
    Record<number, { ok: boolean; text: string }>
  >({});
  const [testingId, setTestingId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('telegram');
  const [isEnabled, setIsEnabled] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadChannels = useCallback(async () => {
    try {
      const res = await api.getChannels();
      setChannels(res.channels);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  function openCreate() {
    setEditingId(null);
    setName('');
    setType('telegram');
    setIsEnabled(true);
    setBotToken('');
    setChatId('');
    setWebhookUrl('');
    setUrl('');
    setSecret('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(ch: NotificationChannel) {
    setEditingId(ch.id);
    setName(ch.name);
    setType(ch.type);
    setIsEnabled(ch.isEnabled);
    setBotToken(ch.config.botToken ?? '');
    setChatId(ch.config.chatId ?? '');
    setWebhookUrl(ch.config.webhookUrl ?? '');
    setUrl(ch.config.url ?? '');
    setSecret(ch.config.secret ?? '');
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const config =
        type === 'telegram'
          ? { botToken: botToken.trim(), chatId: chatId.trim() }
          : type === 'discord'
            ? { webhookUrl: webhookUrl.trim() }
            : { url: url.trim(), secret: secret.trim() };

      const payload = {
        name: name.trim(),
        type,
        isEnabled,
        config,
      };
      if (editingId !== null) {
        await api.updateChannel(editingId, payload);
      } else {
        await api.createChannel(payload);
      }
      setModalOpen(false);
      await loadChannels();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kanal kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    try {
      const res = await api.testChannel(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: res.ok
          ? { ok: true, text: 'Test bildirimi başarıyla gönderildi.' }
          : { ok: false, text: res.error ?? 'Gönderim başarısız.' },
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          text: err instanceof Error ? err.message : 'Gönderim başarısız.',
        },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: number, chName: string) {
    if (!window.confirm(`"${chName}" kanalını silmek istediğinize emin misiniz?`)) return;
    await api.deleteChannel(id);
    await loadChannels();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            Bildirim Kanalları
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Bir servis 3 kez üst üste yanıt veremediğinde (Down) ve düzeldiğinde (Up) uyarı gönderilecek kanallar.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition"
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
          <span>Kanal Ekle</span>
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Yükleniyor...
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Henüz bildirim kanalı yapılandırılmadı. Telegram, Discord veya Webhook kanalı ekleyebilirsiniz.
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => {
            const feedback = testResult[ch.id];
            return (
              <div
                key={ch.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--color-foreground)]">
                        {ch.name}
                      </span>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-mono-tabular text-[11px] uppercase text-[var(--color-muted-foreground)]">
                        {ch.type}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          ch.isEnabled
                            ? 'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-secondary)]'
                            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                        }`}
                      >
                        {ch.isEnabled ? 'Aktif' : 'Devre Dışı'}
                      </span>
                    </div>
                    <p className="font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                      {ch.type === 'telegram'
                        ? `Chat ID: ${ch.config.chatId} · Token: ${ch.config.botToken}`
                        : ch.type === 'discord'
                          ? `Webhook: ${ch.config.webhookUrl}`
                          : `URL: ${ch.config.url}${ch.config.secret ? ` · Secret: ${ch.config.secret}` : ''}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={testingId === ch.id}
                      onClick={() => void handleTest(ch.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs font-medium text-[var(--color-foreground)] hover:brightness-110 disabled:opacity-50"
                    >
                      <PaperPlaneTilt size={14} aria-hidden="true" />
                      <span>
                        {testingId === ch.id ? 'Gönderiliyor...' : 'Test Gönder'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(ch)}
                      aria-label="Kanalı düzenle"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                    >
                      <PencilSimple size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(ch.id, ch.name)}
                      aria-label="Kanalı sil"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[#F87171]"
                    >
                      <Trash size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {feedback && (
                  <p
                    className={`text-xs ${
                      feedback.ok ? 'text-[var(--color-secondary)]' : 'text-[#F87171]'
                    }`}
                  >
                    {feedback.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editingId !== null ? 'Bildirim Kanalını Düzenle' : 'Yeni Bildirim Kanalı'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] px-3 py-2 text-xs text-[#F87171]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Kanal Adı
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Ops Telegram"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Kanal Türü
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ChannelType)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="telegram">Telegram Bot</option>
                <option value="discord">Discord Webhook</option>
                <option value="webhook">Generic Webhook (JSON + HMAC)</option>
              </select>
            </div>
          </div>

          {type === 'telegram' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                  Bot Token
                </label>
                <input
                  type="text"
                  required
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdef..."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                  Chat ID
                </label>
                <input
                  type="text"
                  required
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
                />
              </div>
            </div>
          )}

          {type === 'discord' && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                Discord Webhook URL
              </label>
              <input
                type="text"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
              />
            </div>
          )}

          {type === 'webhook' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                  Webhook URL
                </label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.ornek.com/pulseguard"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
                  HMAC Secret (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="X-PulseGuard-Signature için gizli anahtar"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono-tabular text-sm"
                />
              </div>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>Kanal aktif</span>
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
