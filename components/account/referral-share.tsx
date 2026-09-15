"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

/**
 * The share link, with copy and the native share sheet.
 *
 * `navigator.share` only exists on mobile and only over HTTPS, so it is
 * feature-detected rather than assumed — on a desktop browser the copy button
 * is the whole control.
 */
export function ReferralShare({
  code,
  link,
  referrerPaisa,
  referredPaisa,
}: {
  code: string | null;
  link: string;
  referrerPaisa: number;
  referredPaisa: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the input is selectable either way.
    }
  };

  const share = async () => {
    if (typeof navigator === "undefined" || !("share" in navigator)) return;
    try {
      await navigator.share({ title: "Shop with me", url: link });
    } catch {
      // The sheet was dismissed. Nothing to report.
    }
  };

  if (!code) {
    return (
      <Card className="p-5">
        <p className="text-sm text-ink-muted">
          Your referral code could not be issued. Reload the page to try again.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Your link</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        They get {formatTaka(referredPaisa)} on their first delivered order. You
        get {formatTaka(referrerPaisa)}.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-sunken px-3 text-sm text-ink-soft"
          aria-label="Your referral link"
        />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Button type="button" onClick={share}>
            <Share2 size={15} />
            Share
          </Button>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-ink-faint">
        Code <span className="font-mono font-semibold text-ink-soft">{code}</span>
      </p>
    </Card>
  );
}
