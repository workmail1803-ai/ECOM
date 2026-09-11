"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Eye, Loader2, Phone, Hash, Clock } from "lucide-react";
import { verifyManualPayment, getProofUrl } from "@/lib/actions/admin";
import type { ManualPaymentRow } from "@/lib/queries/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

/**
 * One manual bKash/Nagad submission, with the screenshot and everything a
 * staff member needs to match it against the wallet statement.
 *
 * The screenshot is fetched on demand through a short-lived signed URL rather
 * than rendered eagerly: the bucket is private, and a queue of thirty pending
 * payments should not mint thirty URLs nobody looks at.
 */
export function ManualPaymentCard({ row }: { row: ManualPaymentRow }) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const isPending = row.status === "pending" || row.status === "initiated";

  async function showProof() {
    if (!row.screenshot_path || proofUrl) return;
    setLoadingProof(true);
    const url = await getProofUrl(row.screenshot_path);
    setLoadingProof(false);
    if (!url) {
      toast.error("Could not load that screenshot.");
      return;
    }
    setProofUrl(url);
  }

  function decide(approve: boolean) {
    if (
      approve &&
      !window.confirm(
        `Confirm you have found transaction ${row.provider_txn_id} for ${formatTaka(
          row.amount_paisa,
        )} in your ${row.provider} statement. This marks order ${row.order_number} as paid.`,
      )
    ) {
      return;
    }

    start(async () => {
      const result = await verifyManualPayment(row.id, approve, reason || undefined);
      if (!result.ok) {
        toast.error(result.error ?? "Could not record that decision.");
        return;
      }
      toast.success(result.message ?? "Done.");
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Card className={isPending ? "border-warning/30 p-4" : "p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/orders/${row.order_id}`}
              className="font-semibold tabular text-ink hover:text-brand-700"
            >
              {row.order_number}
            </Link>
            <Badge tone="brand">{row.provider === "bkash" ? "bKash" : "Nagad"}</Badge>
            <Badge
              tone={
                row.status === "successful"
                  ? "success"
                  : row.status === "failed"
                    ? "danger"
                    : "warning"
              }
            >
              {row.status === "successful"
                ? "Verified"
                : row.status === "failed"
                  ? "Rejected"
                  : "Awaiting check"}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-ink-muted">
            {row.customer_name} · {row.customer_phone}
          </p>

          <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <Hash size={13} className="shrink-0 text-ink-faint" />
              <dt className="sr-only">Transaction ID</dt>
              <dd className="tabular font-semibold text-ink">
                {row.provider_txn_id ?? "—"}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone size={13} className="shrink-0 text-ink-faint" />
              <dt className="sr-only">Sent from</dt>
              <dd className="tabular text-ink-soft">{row.sender_msisdn ?? "—"}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="shrink-0 text-ink-faint" />
              <dt className="sr-only">Submitted</dt>
              <dd className="text-ink-muted">
                {row.submitted_at
                  ? new Date(row.submitted_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not submitted yet"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular text-ink">
            {formatTaka(row.amount_paisa)}
          </p>
          <p className="text-[11px] text-ink-faint">expected</p>
        </div>
      </div>

      {/* Proof */}
      {row.screenshot_path ? (
        <div className="mt-3">
          {proofUrl ? (
            <a href={proofUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proofUrl}
                alt={`Payment screenshot for ${row.order_number}`}
                className="max-h-96 w-auto rounded-lg border border-line"
              />
            </a>
          ) : (
            <Button size="sm" variant="outline" onClick={showProof} disabled={loadingProof}>
              {loadingProof ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />}
              View screenshot
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          No screenshot attached — verify against the transaction ID in your{" "}
          {row.provider === "bkash" ? "bKash" : "Nagad"} statement.
        </p>
      )}

      {row.rejection_reason ? (
        <p className="mt-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
          Rejected: {row.rejection_reason}
        </p>
      ) : null}

      {row.verified_at ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          {row.status === "successful" ? "Verified" : "Rejected"} by{" "}
          {row.verified_by_name ?? "staff"} on{" "}
          {new Date(row.verified_at).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}

      {isPending ? (
        <div className="mt-3 border-t border-line pt-3">
          {rejecting ? (
            <div className="space-y-2">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? e.g. no matching transaction found"
                className="h-9 text-sm"
                aria-label="Rejection reason"
              />
              <p className="text-[11px] text-ink-muted">
                The order stays open so the customer can correct the ID and resubmit.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={pending}
                  onClick={() => decide(false)}
                >
                  Confirm rejection
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRejecting(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={pending} onClick={() => decide(true)}>
                <Check size={14} />
                Verify & confirm order
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejecting(true)}
                disabled={pending}
                className="text-danger hover:bg-danger-soft"
              >
                <X size={14} />
                Reject
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}
