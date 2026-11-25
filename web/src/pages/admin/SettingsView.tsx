import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';

export function SettingsView() {
  const [siteTitle, setSiteTitle] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [siteMsg, setSiteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSite, setSavingSite] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSiteTitle(s.site_title);
        setSiteDescription(s.site_description);
      })
      .catch(() => {
        setSiteMsg({ ok: false, text: 'Ayarlar yüklenemedi.' });
      });
  }, []);

  async function handleSaveSite(e: FormEvent) {
    e.preventDefault();
    setSiteMsg(null);
    setSavingSite(true);
    try {
      await api.updateSettings({
        site_title: siteTitle.trim(),
        site_description: siteDescription.trim(),
      });
      setSiteMsg({ ok: true, text: 'Durum sayfası ayarları güncellendi.' });
    } catch (err) {
      setSiteMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Ayarlar kaydedilemedi.',
      });
    } finally {
      setSavingSite(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setSavingPw(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPwMsg({ ok: true, text: 'Yönetici parolası başarıyla değiştirildi.' });
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Parola değiştirilemedi.',
      });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Ayarlar
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Public Status Page görünüm metinlerini ve yönetici hesap güvenliğini yönetin.
        </p>
      </div>

      <form
        onSubmit={handleSaveSite}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-[var(--color-foreground)]">
          Public Status Page Bilgileri
        </h2>

        {siteMsg && (
          <p
            className={`text-xs ${
              siteMsg.ok ? 'text-[var(--color-secondary)]' : 'text-[#F87171]'
            }`}
          >
            {siteMsg.text}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
            Sayfa Başlığı
          </label>
          <input
            type="text"
            required
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
            Açıklama
          </label>
          <textarea
            rows={2}
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={savingSite}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {savingSite ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-[var(--color-foreground)]">
          Yönetici Parolasını Değiştir
        </h2>

        {pwMsg && (
          <p
            className={`text-xs ${
              pwMsg.ok ? 'text-[var(--color-secondary)]' : 'text-[#F87171]'
            }`}
          >
            {pwMsg.text}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
            Mevcut Parola
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1">
            Yeni Parola (En az 8 karakter)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={savingPw}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] hover:brightness-110 disabled:opacity-60"
        >
          {savingPw ? 'Güncelleniyor...' : 'Parolayı Güncelle'}
        </button>
      </form>
    </div>
  );
}
