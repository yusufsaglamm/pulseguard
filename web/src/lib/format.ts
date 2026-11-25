export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDayLabel(dayKey: string): string {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3) return dayKey;
  const d = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!));
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'Devam ediyor';
  const diffMs = Math.max(0, Date.parse(endIso) - Date.parse(startIso));
  const totalMin = Math.round(diffMs / 60_000);
  if (totalMin < 1) return '< 1 dk';
  if (totalMin < 60) return `${totalMin} dk`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours} sa ${mins} dk` : `${hours} sa`;
}

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  investigating: 'İnceleniyor',
  identified: 'Tespit Edildi',
  monitoring: 'İzleniyor',
  resolved: 'Çözüldü',
};

export const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  minor: 'Düşük',
  major: 'Orta',
  critical: 'Kritik',
};

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Planlandı',
  in_progress: 'Devam Ediyor',
  completed: 'Tamamlandı',
};
