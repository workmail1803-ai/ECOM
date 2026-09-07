import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Small presentational pieces shared across storefront and admin. */

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "sale";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-soft border-line",
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    success: "bg-success-soft text-success border-success/20",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/20",
    sale: "bg-sale text-white border-transparent",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} role="separator" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/**
 * Star rating. `value` is the average out of 5; `count` renders as "(12)".
 * Half-stars are drawn with a clipped overlay rather than a half-star glyph so
 * it stays crisp at 12px.
 */
export function Rating({
  value,
  count,
  size = 14,
  className,
}: {
  value: number | null;
  count?: number;
  size?: number;
  className?: string;
}) {
  if (value == null) {
    return (
      <span className={cn("text-xs text-ink-faint", className)}>No reviews yet</span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className="relative inline-flex"
        role="img"
        aria-label={`Rated ${value} out of 5`}
      >
        <span className="flex text-line-strong">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span
          className="absolute inset-0 flex overflow-hidden text-warning"
          style={{ width: `${(value / 5) * 100}%` }}
          aria-hidden
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
      </span>
      {count != null ? (
        <span className="text-xs text-ink-muted tabular">({count})</span>
      ) : null}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Page-level heading used by account and admin sections. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
