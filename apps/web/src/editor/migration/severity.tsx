'use client';

import type { RiskLevel, Severity } from '@dashdb/core/lite';
import { Badge, cn } from '@dashdb/ui';
import { CircleCheckIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react';

const ICONS = {
  info: InfoIcon,
  caution: TriangleAlertIcon,
  dangerous: OctagonAlertIcon,
} as const;

const TONES = {
  info: 'text-primary-text',
  caution: 'text-warning-text',
  dangerous: 'text-danger-text',
} as const;

export const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'Info',
  caution: 'Caution',
  dangerous: 'Dangerous',
};

export function SeverityIcon({
  severity,
  label,
  className,
}: {
  severity: Severity;
  label?: string;
  className?: string;
}) {
  const Icon = ICONS[severity];
  return (
    <Icon
      role="img"
      aria-label={label ?? SEVERITY_LABELS[severity]}
      className={cn('size-4 shrink-0', TONES[severity], className)}
    />
  );
}

const RISK = {
  safe: { label: 'Safe', icon: CircleCheckIcon, className: 'bg-success/10 text-success-text' },
  caution: {
    label: 'Caution',
    icon: TriangleAlertIcon,
    className: 'bg-warning/10 text-warning-text',
  },
  dangerous: {
    label: 'Dangerous',
    icon: OctagonAlertIcon,
    className: 'bg-danger/10 text-danger-text',
  },
} as const;

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { label, icon: Icon, className } = RISK[risk];
  return (
    <Badge className={className} data-testid="risk-badge" data-risk={risk}>
      <Icon aria-hidden /> {label}
    </Badge>
  );
}
