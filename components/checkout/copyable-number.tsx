"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * The receive number, large and tap-to-copy.
 *
 * Copying is the point: typing an 11-digit number into a wallet app by hand is
 * where wrong-recipient transfers come from.
 */
export function CopyableNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, or permission denied) — the number
      // is on screen either way, so this is not worth an error toast.
      toast.message("Copy the number manually", { description: value });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand-600"
      aria-label={`Copy number ${value}`}
    >
      <span className="tabular text-xl font-bold tracking-wide text-ink">
        {value}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
