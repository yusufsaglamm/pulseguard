import {
  ArrowsClockwise,
  CheckCircle,
  Globe,
  HardDrives,
  Pulse,
  ShieldCheck,
  Warning,
  Wrench,
  XCircle,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PublicStatusResponse } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { ThemeToggle } from '../components/ThemeToggle';
import { UptimeBar90 } from '../components/UptimeBar90';
import {
  formatDateTime,
  formatDuration,
  INCIDENT_SEVERITY_LABELS,
} from '../lib/format';

const OVERALL_BANNER: Record<
  PublicStatusResponse['overallStatus'],
  {
    title: string;
    subtitle: string;
    container: string;
    iconColor: string;
    icon: typeof CheckCircle;
  }
> = {
  operational: {
    title: 'Tüm Sistemler Çalışıyor',
    subtitle: 'İzlenen tüm web servisleri, API uç noktaları ve portlar normal yanıt veriyor.',
    container:
      'border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,var(--color-card))]',
    iconColor: 'text-[var(--color-secondary)]',
    icon: CheckCircle,
  },
  partial_outage: {
    title: 'Kısmi Sistem Kesintisi',
    subtitle: 'Bazı servislerde kesinti veya performans düşüşü yaşanıyor.',
    container:
      'border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-card))]',
    iconColor: 'text-[#FBBF24]',
    icon: Warning,
  },
  major_outage: {
    title: 'Büyük Sistem Kesintisi',
    subtitle: 'Servislerin önemli bir bölümüne şu anda erişilemiyor.',
    container:
      'border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,var(--color-card))]',
    iconColor: 'text-[#F87171]',
    icon: XCircle,
  },
  maintenance: {
    title: 'Planlı Bakım Devam Ediyor',
    subtitle: 'Önceden duyurulan planlı bakım çalışması sürdürülüyor.',
    container:
      'border-[color-mix(in_srgb,var(--color-info)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-info)_10%,var(--color-card))]',
    iconColor: 'text-[#60A5FA]',
    icon: Wrench,
  },
};

export function StatusPage() {
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await api.getPublicStatus();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum verisi alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void loadStatus();
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const banner = data ? OVERALL_BANNER[data.overallStatus] : OVERALL_BANNER.operational;
  const BannerIcon = banner.icon;

  const activeIncidents =
    data?.incidents.filter((inc) => inc.status !== 'resolved') ?? [];
  const pastIncidents =
    data?.incidents.filter((inc) => inc.status === 'resolved') ?? [];
  const activeMaintenances =
    data?.maintenances.filter((m) => m.status !== 'completed') ?? [];
  const upMonitorsCount =
    data?.monitors.filter((m) => m.status === 'up').length ?? 0;

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-secondary)]">
              <Pulse size={20} weight="bold" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--color-foreground)]">
                {data?.site.title ?? 'PulseGuard Servis Durumu'}
              </h1>
              {data?.site.description && (
                <p className="text-xs text-[var(--color-muted-foreground)] max-w-xl">
                  {data.site.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadStatus(true)}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
            >
              <ArrowsClockwise
                size={15}
                className={refreshing ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              <span>Yenile</span>
            </button>
            <ThemeToggle />
            <Link
              to="/admin"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs font-medium text-[var(--color-foreground)] hover:brightness-110 transition"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              <span>Yönetim</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] space-y-8 px-4 py-8 sm:px-6">
        {loading ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Sistem durumu yükleniyor...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-destructive)_50%,transparent)] bg-[var(--color-card)] p-6 text-sm text-[#F87171]">
            {error}
          </div>
        ) : data ? (
          <>
            {/* Overall status banner */}
            <section
              aria-label="Genel sistem durumu"
              className={`rounded-xl border p-5 sm:p-6 ${banner.container}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3.5">
                  <BannerIcon
                    size={28}
                    weight="fill"
                    className={`mt-0.5 shrink-0 ${banner.iconColor}`}
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
                      {banner.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
                      {banner.subtitle}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-start sm:items-end text-xs text-[var(--color-muted-foreground)]">
                  <span className="font-mono-tabular font-semibold text-[var(--color-foreground)]">
                    {upMonitorsCount} / {data.monitors.length} servis aktif
                  </span>
                  <span className="font-mono-tabular mt-0.5">
                    Son güncelleme: {formatDateTime(data.generatedAt)}
                  </span>
                </div>
              </div>
            </section>

            {/* Planned maintenances */}
            {activeMaintenances.length > 0 && (
              <section className="space-y-3" aria-label="Planlı bakım duyuruları">
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Planlı Bakım Duyuruları
                </h2>
                <div className="space-y-3">
                  {activeMaintenances.map((m) => (
                    <article
                      key={m.id}
                      className="rounded-xl border border-[color-mix(in_srgb,var(--color-info)_35%,transparent)] bg-[var(--color-card)] p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                          {m.title}
                        </h3>
                        <StatusBadge variant={m.status} />
                      </div>
                      {m.description && (
                        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                          {m.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)] font-mono-tabular">
                        <span>Başlangıç: {formatDateTime(m.startsAt)}</span>
                        <span>Bitiş: {formatDateTime(m.endsAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Active incidents */}
            {activeIncidents.length > 0 && (
              <section className="space-y-3" aria-label="Aktif olaylar">
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Devam Eden Olaylar
                </h2>
                <div className="space-y-3">
                  {activeIncidents.map((inc) => (
                    <article
                      key={inc.id}
                      className="rounded-xl border border-[color-mix(in_srgb,var(--color-destructive)_40%,transparent)] bg-[var(--color-card)] p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                            {inc.title}
                          </h3>
                          <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                            {INCIDENT_SEVERITY_LABELS[inc.severity] ?? inc.severity}
                          </span>
                          {inc.monitorName && (
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              · {inc.monitorName}
                            </span>
                          )}
                        </div>
                        <StatusBadge variant={inc.status} />
                      </div>

                      <div className="mt-3 space-y-2.5 border-t border-[var(--color-border)] pt-3">
                        {inc.updates.map((upd) => (
                          <div key={upd.id} className="flex flex-col gap-1 sm:flex-row sm:gap-3 text-sm">
                            <div className="flex items-center gap-2 shrink-0 sm:w-44">
                              <StatusBadge variant={upd.status} />
                            </div>
                            <div className="flex-1">
                              <p className="text-[var(--color-foreground)]">{upd.message}</p>
                              <span className="font-mono-tabular text-[11px] text-[var(--color-muted-foreground)]">
                                {formatDateTime(upd.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Services 90-day uptime list */}
            <section className="space-y-3" aria-label="Servisler ve son 90 günlük çalışma durumu">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                  Servisler
                </h2>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  Son 90 günlük erişilebilirlik özeti
                </span>
              </div>

              {data.monitors.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Henüz herkese açık bir servis tanımlanmadı.
                  </p>
                  <Link
                    to="/admin"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 transition"
                  >
                    Yönetim Panelinden Servis Ekle
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
                  {data.monitors.map((monitor) => (
                    <div key={monitor.id} className="p-4 sm:p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {monitor.type === 'tcp' ? (
                            <HardDrives
                              size={18}
                              className="shrink-0 text-[var(--color-muted-foreground)]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Globe
                              size={18}
                              className="shrink-0 text-[var(--color-muted-foreground)]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate text-[15px] font-medium text-[var(--color-foreground)]">
                            {monitor.name}
                          </span>
                          <span className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium uppercase text-[var(--color-muted-foreground)]">
                            {monitor.type}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          {monitor.lastLatencyMs !== null && (
                            <span className="font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                              {monitor.lastLatencyMs} ms
                            </span>
                          )}
                          <span className="font-mono-tabular text-xs font-semibold text-[var(--color-foreground)]">
                            {monitor.uptime90d !== null ? `%${monitor.uptime90d}` : '—'}
                          </span>
                          <StatusBadge variant={monitor.status} />
                        </div>
                      </div>

                      <UptimeBar90 days={monitor.days90} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent incident history */}
            <section className="space-y-3" aria-label="Son 30 günlük olay geçmişi">
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">
                Olay Geçmişi (Son 30 Gün)
              </h2>
              {pastIncidents.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-sm text-[var(--color-muted-foreground)]">
                  Son 30 gün içinde çözümlenmiş veya geçmiş bir kesinti kaydı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-3">
                  {pastIncidents.map((inc) => (
                    <article
                      key={inc.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                            {inc.title}
                          </h3>
                          {inc.monitorName && (
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              · {inc.monitorName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-xs text-[var(--color-muted-foreground)]">
                            Süre: {formatDuration(inc.startedAt, inc.resolvedAt)}
                          </span>
                          <StatusBadge variant={inc.status} />
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
                        {inc.updates.map((upd) => (
                          <div key={upd.id} className="flex flex-col gap-1 sm:flex-row sm:gap-3 text-sm">
                            <div className="shrink-0 sm:w-36">
                              <StatusBadge variant={upd.status} />
                            </div>
                            <div className="flex-1">
                              <p className="text-[var(--color-foreground)]">{upd.message}</p>
                              <span className="font-mono-tabular text-[11px] text-[var(--color-muted-foreground)]">
                                {formatDateTime(upd.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
