import type { ComponentType, ReactNode } from 'react';
import type { Issue, Severity } from '../lib/api';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Healthy: 'bg-good-soft text-good',
  'Needs attention': 'bg-fair-soft text-fair',
  'At risk': 'bg-risk-soft text-risk',
};

export function StatusPill({ status }: { status: string }) {
  const dot =
    status === 'Healthy'
      ? 'bg-good'
      : status === 'Needs attention'
        ? 'bg-fair'
        : status === 'At risk'
          ? 'bg-risk'
          : 'bg-ink-faint';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_STYLES[status] ?? 'bg-line-soft text-ink-soft'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'bg-risk-soft text-risk',
  medium: 'bg-fair-soft text-fair',
  low: 'bg-line-soft text-ink-soft',
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function PassFailBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        passed ? 'bg-good-soft text-good' : 'bg-risk-soft text-risk'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${passed ? 'bg-good' : 'bg-risk'}`}
      />
      {passed ? 'PASS' : 'FAIL'}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  loading = false,
  icon: Icon,
  tone = 'text-ink-faint bg-line-soft',
}: {
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
  icon?: ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <div className="group rounded-2xl border border-line bg-panel px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-[#dfe3e8] hover:shadow-[0_4px_14px_rgba(16,24,40,0.06)]">
      <div className="flex items-center gap-2.5">
        {Icon ? (
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-20 rounded-md" />
      ) : (
        <p className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d2939] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-panel/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-line-soft text-ink-faint">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12.5 9 17.5 20 6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[13px] font-medium text-ink-soft">{children}</span>
  );
}

export function ScoreRow({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 90 ? 'bg-good' : value >= 75 ? 'bg-fair' : 'bg-risk';
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-semibold text-ink">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full rounded-full ${tone} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
      />
      <aside
        aria-labelledby={labelledBy}
        className="fade-up relative flex h-full w-full max-w-[460px] flex-col border-l border-line bg-panel shadow-2xl"
      >
        {children}
      </aside>
    </div>
  );
}

export function DrawerHeader({
  title,
  onClose,
  meta,
}: {
  title: string;
  onClose: () => void;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
      <div>
        <h3
          id="drawer-title"
          className="text-[15px] font-semibold tracking-[-0.01em] text-ink"
        >
          {title}
        </h3>
        {meta ? <div className="mt-2">{meta}</div> : null}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 rounded-lg p-1.5 text-ink-faint transition hover:bg-line-soft hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      <div className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

export function IssueDetailBody({ issue }: { issue: Issue }) {
  return (
    <div className="space-y-5">
      <DetailBlock label="What happened">{issue.whatHappened}</DetailBlock>
      <DetailBlock label="Expected behavior">{issue.expected}</DetailBlock>
      <DetailBlock label="Actual behavior">{issue.actual}</DetailBlock>
      <DetailBlock label="Why it matters">{issue.whyItMatters}</DetailBlock>
      <div className="rounded-xl border border-line bg-[#f8f9fb] p-4">
        <DetailBlock label="Recommended action">{issue.recommendation}</DetailBlock>
      </div>
    </div>
  );
}

export function ReadyPill({ label = 'Ready to Test' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-medium text-[#4f46e5]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#4f46e5]" />
      {label}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 backdrop-blur-[3px]"
      />
      <div className="fade-up relative w-full max-w-[460px] rounded-2xl border border-line bg-panel p-6 shadow-[0_24px_60px_-12px_rgba(16,24,40,0.25)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-faint transition hover:bg-line-soft hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
