"use client";

import { useActionState, useState } from "react";
import { CreditCard, Plus, Banknote } from "lucide-react";
import {
  saveCreditAccount,
  recordCreditRepayment,
  type AdminState,
} from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

const initial: AdminState = { ok: false };

export interface CreditAccountRow {
  phone: string;
  holder_name: string | null;
  limit_paisa: number;
  is_active: boolean;
  note: string | null;
  outstandingPaisa: number;
  availablePaisa: number;
}

export function CreditAccountsManager({ accounts }: { accounts: CreditAccountRow[] }) {
  const [state, action, pending] = useActionState(saveCreditAccount, initial);
  const [repayFor, setRepayFor] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit p-5">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-ink">Grant credit</h2>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          Entering a number that already has an account updates it.
        </p>

        <form action={action} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Mobile number
            </span>
            <input
              name="phone"
              required
              placeholder="01XXXXXXXXX"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Account holder
            </span>
            <input
              name="holder_name"
              placeholder="Name on the account"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Credit limit (৳)
            </span>
            <input
              name="limit_taka"
              type="number"
              min={0}
              step={100}
              defaultValue={5000}
              required
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Note
            </span>
            <input
              name="note"
              placeholder="Why this account exists"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>

          <Button type="submit" size="sm" loading={pending}>
            <Plus size={15} />
            Save account
          </Button>

          {state.error ? (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          ) : state.ok && state.message ? (
            <p className="text-sm text-success">{state.message}</p>
          ) : null}
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {accounts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<CreditCard size={28} />}
              title="No credit accounts"
              description="Grant one on the left. Customers check theirs at checkout with their phone number."
            />
          </div>
        ) : (
          <table className="w-full min-w-150 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-3 py-3 text-right font-medium">Limit</th>
                <th className="px-3 py-3 text-right font-medium">Outstanding</th>
                <th className="px-3 py-3 text-right font-medium">Available</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {accounts.map((a) => (
                <tr key={a.phone} className="align-top hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">
                      {a.holder_name ?? "—"}{" "}
                      {!a.is_active ? <Badge tone="neutral">Paused</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-muted tabular">{a.phone}</p>
                    {a.note ? (
                      <p className="mt-0.5 text-[11px] text-ink-faint">{a.note}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-muted">
                    {formatTaka(a.limit_paisa)}
                  </td>
                  <td className="px-3 py-3 text-right tabular">
                    <span
                      className={
                        a.outstandingPaisa > 0 ? "font-semibold text-warning" : "text-ink-muted"
                      }
                    >
                      {formatTaka(a.outstandingPaisa)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular font-semibold text-ink">
                    {formatTaka(a.availablePaisa)}
                  </td>
                  <td className="px-4 py-3">
                    {repayFor === a.phone ? (
                      <RepaymentForm phone={a.phone} onDone={() => setRepayFor(null)} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRepayFor(a.phone)}
                        disabled={a.outstandingPaisa <= 0}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
                      >
                        <Banknote size={14} />
                        Record repayment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function RepaymentForm({ phone, onDone }: { phone: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(recordCreditRepayment, initial);

  // Close only on success, so a rejected amount keeps the form open with the
  // reason visible.
  if (state.ok) {
    onDone();
  }

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="phone" value={phone} />
      <div className="flex gap-1.5">
        <input
          name="amount_taka"
          type="number"
          min={1}
          step={1}
          required
          placeholder="৳"
          className="h-8 w-24 rounded-md border border-line-strong bg-surface px-2 text-xs focus:border-brand-600 focus:outline-none"
        />
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
