import React from 'react';
import { Archive, Gauge, KeyRound, ListChecks, ScrollText, Shield, UserCheck, type LucideIcon } from 'lucide-react';
import type { HttpMethod, MiddlewareKind, MiddlewareStep } from '../../types';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Method colors reuse the semantic tokens so both themes stay in contrast:
 * reads = index teal, creates = accent green, replace = FK blue,
 * partial update = PK ochre, delete = danger.
 */
export const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'text-idx bg-idx-soft border-idx/30',
  POST: 'text-accent bg-accent-soft border-accent/30',
  PUT: 'text-fk bg-fk-soft border-fk/30',
  PATCH: 'text-pk bg-pk-soft border-pk/30',
  DELETE: 'text-danger bg-danger-soft border-danger/30',
};

export function MethodBadge({ method, className = '' }: { method: HttpMethod; className?: string }) {
  return (
    <span
      className={`inline-flex h-[18px] w-[52px] shrink-0 items-center justify-center rounded-[4px] border font-mono text-[10px] font-semibold tracking-[0.04em] ${METHOD_TONE[method]} ${className}`}
    >
      {method}
    </span>
  );
}

export const MIDDLEWARE_ICONS: Record<MiddlewareKind, LucideIcon> = {
  rateLimit: Gauge,
  auth: KeyRound,
  validateZod: ListChecks,
  rbac: Shield,
  ownership: UserCheck,
  auditLog: ScrollText,
  softDelete: Archive,
};

/** Compact, human summary of one enabled step, e.g. `100/min`, `admin`. */
export function stepShortLabel(step: MiddlewareStep): string {
  switch (step.kind) {
    case 'rateLimit':
      return `${step.config?.rpm ?? 60}/min`;
    case 'auth':
      return 'auth';
    case 'validateZod':
      return 'zod';
    case 'rbac':
      return (step.config?.roles?.length ? step.config.roles : ['admin']).join('|');
    case 'ownership':
      return `owner:${step.config?.ownerField ?? 'userId'}`;
    case 'auditLog':
      return 'audit';
    case 'softDelete':
      return 'soft';
  }
}

/** Titled block inside a panel body (matches the inspector's sections). */
export function PanelSection({
  title,
  aside,
  children,
  hint,
}: {
  title: string;
  aside?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="section-title">{title}</h3>
          {hint && <p className="mt-0.5 text-[11.5px] text-fg-secondary">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Toggleable chip used for query / body field pickers. */
export const FieldChip: React.FC<{
  label: string;
  meta?: string;
  pressed: boolean;
  onToggle: () => void;
  required?: boolean;
}> = ({
  label,
  meta,
  pressed,
  onToggle,
  required,
}) => {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      title={required ? `${label} (required)` : label}
      className={`inline-flex h-7 items-center gap-1.5 rounded-control border px-2 font-mono text-[11.5px] transition ${
        pressed
          ? 'border-accent/40 bg-accent-soft text-fg'
          : 'border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg'
      }`}
    >
      <span>
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {meta && <span className={pressed ? 'text-fg-secondary' : 'text-fg-muted'}>{meta}</span>}
    </button>
  );
};
