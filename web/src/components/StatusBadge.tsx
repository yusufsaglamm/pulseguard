import {
  CheckCircle,
  Question,
  Warning,
  Wrench,
  XCircle,
} from '@phosphor-icons/react';

export type BadgeVariant =
  | 'up'
  | 'down'
  | 'unknown'
  | 'operational'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved'
  | 'scheduled'
  | 'in_progress'
  | 'completed';

const VARIANT_CONFIG: Record<
  BadgeVariant,
  { label: string; classes: string; icon: typeof CheckCircle }
> = {
  up: {
    label: 'Çalışıyor',
    classes:
      'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-secondary)] border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
    icon: CheckCircle,
  },
  operational: {
    label: 'Çalışıyor',
    classes:
      'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-secondary)] border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
    icon: CheckCircle,
  },
  down: {
    label: 'Kesinti',
    classes:
      'bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-badge-danger)] border-[color-mix(in_srgb,var(--color-destructive)_45%,transparent)]',
    icon: XCircle,
  },
  major_outage: {
    label: 'Büyük Kesinti',
    classes:
      'bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-badge-danger)] border-[color-mix(in_srgb,var(--color-destructive)_45%,transparent)]',
    icon: XCircle,
  },
  partial_outage: {
    label: 'Kısmi Kesinti',
    classes:
      'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-badge-warning)] border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)]',
    icon: Warning,
  },
  unknown: {
    label: 'Bekleniyor',
    classes:
      'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border-[var(--color-border)]',
    icon: Question,
  },
  maintenance: {
    label: 'Planlı Bakım',
    classes:
      'bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-badge-info)] border-[color-mix(in_srgb,var(--color-info)_40%,transparent)]',
    icon: Wrench,
  },
  investigating: {
    label: 'İnceleniyor',
    classes:
      'bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-badge-danger)] border-[color-mix(in_srgb,var(--color-destructive)_40%,transparent)]',
    icon: Warning,
  },
  identified: {
    label: 'Tespit Edildi',
    classes:
      'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-badge-warning)] border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)]',
    icon: Warning,
  },
  monitoring: {
    label: 'İzleniyor',
    classes:
      'bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-badge-info)] border-[color-mix(in_srgb,var(--color-info)_40%,transparent)]',
    icon: Wrench,
  },
  resolved: {
    label: 'Çözüldü',
    classes:
      'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-secondary)] border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
    icon: CheckCircle,
  },
  scheduled: {
    label: 'Planlandı',
    classes:
      'bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-badge-info)] border-[color-mix(in_srgb,var(--color-info)_40%,transparent)]',
    icon: Wrench,
  },
  in_progress: {
    label: 'Devam Ediyor',
    classes:
      'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-badge-warning)] border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)]',
    icon: Wrench,
  },
  completed: {
    label: 'Tamamlandı',
    classes:
      'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-secondary)] border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
    icon: CheckCircle,
  },
};

export function StatusBadge({
  variant,
  labelOverride,
}: {
  variant: BadgeVariant;
  labelOverride?: string;
}) {
  const cfg = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg.classes}`}
    >
      <Icon size={14} weight="fill" aria-hidden="true" />
      <span>{labelOverride ?? cfg.label}</span>
    </span>
  );
}
