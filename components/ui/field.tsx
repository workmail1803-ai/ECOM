import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Text input, textarea, select and the label/error scaffolding around them. */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink",
      "placeholder:text-ink-faint",
      "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
      "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted",
      invalid && "border-danger focus:border-danger focus:ring-danger/15",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "min-h-24 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink",
      "placeholder:text-ink-faint",
      "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
      invalid && "border-danger focus:border-danger focus:ring-danger/15",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface px-3 pr-9 text-sm text-ink",
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[position:right_10px_center] bg-no-repeat",
      "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15",
      invalid && "border-danger",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("block text-sm font-medium text-ink-soft", className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-danger" aria-hidden>
          {" *"}
        </span>
      ) : null}
    </label>
  );
}

/** Label + control + error, with the wiring that makes it announce correctly. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {hint && !error ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
