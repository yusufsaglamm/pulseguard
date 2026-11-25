import {
  ArrowSquareOut,
  Bell,
  Gear,
  Heartbeat,
  List,
  Pulse,
  SignOut,
  WarningCircle,
  Wrench,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { ThemeToggle } from '../../components/ThemeToggle';

const NAV_ITEMS = [
  { to: '/admin', label: 'Monitörler', icon: Heartbeat, end: true },
  { to: '/admin/incidents', label: 'Olaylar', icon: WarningCircle, end: false },
  { to: '/admin/maintenances', label: 'Planlı Bakım', icon: Wrench, end: false },
  { to: '/admin/channels', label: 'Bildirimler', icon: Bell, end: false },
  { to: '/admin/settings', label: 'Ayarlar', icon: Gear, end: false },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        if (!res.authenticated || !res.user) {
          navigate('/admin/login', { replace: true });
          return;
        }
        setUserEmail(res.user.email);
      })
      .catch(() => {
        navigate('/admin/login', { replace: true });
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  async function handleLogout() {
    await api.logout().catch(() => {});
    navigate('/admin/login', { replace: true });
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] text-sm text-[var(--color-muted-foreground)]">
        Oturum doğrulanıyor...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Pulse size={20} weight="bold" className="text-[var(--color-secondary)]" aria-hidden="true" />
          <span className="font-semibold text-sm">PulseGuard Yönetim</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Menüyü aç/kapat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]"
          >
            {mobileMenuOpen ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } lg:flex w-full lg:w-60 shrink-0 flex-col justify-between border-b lg:border-b-0 lg:border-r border-[var(--color-border)] bg-[var(--color-card)] p-4`}
      >
        <div className="space-y-6">
          <div className="hidden lg:flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-secondary)]">
                <Pulse size={18} weight="bold" aria-hidden="true" />
              </div>
              <span className="font-semibold text-sm tracking-tight">PulseGuard</span>
            </div>
            <ThemeToggle />
          </div>

          <nav className="space-y-1" aria-label="Yönetim menüsü">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-secondary)] border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)]'
                        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] border border-transparent'
                    }`
                  }
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 space-y-2 border-t border-[var(--color-border)] pt-4">
          <Link
            to="/"
            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs font-medium text-[var(--color-foreground)] hover:brightness-110 transition"
          >
            <span>Public Status Page</span>
            <ArrowSquareOut size={14} aria-hidden="true" />
          </Link>

          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <span className="truncate text-xs text-[var(--color-muted-foreground)]" title={userEmail}>
              {userEmail}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              title="Çıkış Yap"
              aria-label="Çıkış Yap"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[#F87171]"
            >
              <SignOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
