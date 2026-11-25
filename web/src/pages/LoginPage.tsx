import { ArrowLeft, Pulse, SignIn, UserPlus } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { ThemeToggle } from '../components/ThemeToggle';

export function LoginPage() {
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        if (res.authenticated) {
          navigate('/admin', { replace: true });
          return;
        }
        setSetupRequired(res.setupRequired);
      })
      .catch(() => {
        setError('Sunucuya bağlanılamadı.');
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (setupRequired) {
        await api.setup(email.trim(), password);
      } else {
        await api.login(email.trim(), password);
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('İşlem sırasında bir hata oluştu.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="flex items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Durum Sayfasına Dön</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-secondary)]">
              <Pulse size={22} weight="bold" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
                {setupRequired ? 'İlk Yönetici Kurulumu' : 'PulseGuard Yönetim Girişi'}
              </h1>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {setupRequired
                  ? 'Tek yönetici hesabınızı oluşturarak izlemeyi başlatın.'
                  : 'Monitörleri ve olayları yönetmek için giriş yapın.'}
              </p>
            </div>
          </div>

          {checking ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Kontrol ediliyor...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] px-3.5 py-2.5 text-xs text-[#F87171]"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5"
                >
                  E-posta Adresi
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pulseguard.local"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5"
                >
                  Parola
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={setupRequired ? 8 : 1}
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={setupRequired ? 'En az 8 karakter' : '••••••••'}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/50"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 transition"
              >
                {setupRequired ? (
                  <UserPlus size={18} aria-hidden="true" />
                ) : (
                  <SignIn size={18} aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? 'İşleniyor...'
                    : setupRequired
                      ? 'Hesabı Oluştur ve Başla'
                      : 'Giriş Yap'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
