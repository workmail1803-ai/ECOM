"use client";

import { useState, useTransition } from "react";
import { CreditCard, Check, Search } from "lucide-react";
import { checkCreditAccount, type CreditAccountCheck } from "@/lib/actions/credit";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/utils/money";

/**
 * "Use Credit" — buy on account, settled later.
 *
 * Looked up by phone rather than by login, because a shop's regulars are known
 * by their number and many will never have made an account. The lookup answers
 * about one number at a time and says nothing about an account that is not
 * active, so it cannot be used to find out who has credit.
 *
 * The amount actually drawn is decided by place_order against the ledger. What
 * is shown here is the headroom at the moment of checking.
 */
export function CreditAccountOption({
  phone,
  orderTotalPaisa,
}: {
  /** The mobile number typed into the delivery form above. */
  phone: string;
  orderTotalPaisa: number;
}) {
  const [result, setResult] = useState<CreditAccountCheck | null>(null);
  const [use, setUse] = useState(false);
  const [checking, start] = useTransition();

  const check = () =>
    start(async () => {
      const r = await checkCreditAccount(phone);
      setResult(r);
      setUse(r.found && (r.availablePaisa ?? 0) > 0);
    });

  const available = result?.availablePaisa ?? 0;
  const covers = available >= orderTotalPaisa;

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <CreditCard size={15} className="shrink-0 text-ink-soft" />
        <span className="text-sm font-semibold text-ink">Use credit</span>
        <span className="text-xs text-ink-faint">Checked by phone</span>
      </div>

      {result === null ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            If we have given you an account, you can put this order on it and
            settle later.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            loading={checking}
            disabled={!phone || phone.replace(/\D/g, "").length < 10}
            onClick={check}
          >
            <Search size={14} />
            Check credit
          </Button>
          {!phone || phone.replace(/\D/g, "").length < 10 ? (
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Enter your mobile number above first.
            </p>
          ) : null}
        </>
      ) : !result.found ? (
        <>
          <p className="mt-1.5 text-xs text-ink-muted">
            No credit account for that number. Ask us about one if you order
            regularly.
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Check a different number
          </button>
        </>
      ) : (
        <>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="use_credit_account"
              checked={use}
              onChange={(e) => setUse(e.target.checked)}
              disabled={available <= 0}
              className="mt-0.5 size-4 shrink-0 accent-brand-600"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <Check size={14} className="text-success" />
                {result.holderName ?? "Account found"}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted tabular">
                {formatTaka(available)} available of{" "}
                {formatTaka(result.limitPaisa ?? 0)}
                {(result.outstandingPaisa ?? 0) > 0
                  ? ` · ${formatTaka(result.outstandingPaisa ?? 0)} outstanding`
                  : ""}
              </span>
            </span>
          </label>

          {available <= 0 ? (
            <p className="mt-1.5 text-[11px] leading-4 text-warning">
              This account is at its limit. Settle some of it to use credit
              again.
            </p>
          ) : use ? (
            <p className="mt-1.5 text-[11px] leading-4 text-ink-muted">
              {covers
                ? "Covers this order in full — nothing to pay now."
                : `${formatTaka(orderTotalPaisa - available)} of this order will still need paying.`}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
