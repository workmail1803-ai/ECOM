"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Upload, X, Image as ImageIcon } from "lucide-react";
import { submitPaymentProof, type ProofState } from "@/lib/actions/payment-proof";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";

const initial: ProofState = { ok: false };

export function PaymentProofForm({
  orderNumber,
  method,
  label,
}: {
  orderNumber: string;
  method: "bkash" | "nagad";
  label: string;
}) {
  const [state, action, pending] = useActionState(submitPaymentProof, initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (state.ok) {
    return (
      <div className="mt-4 rounded-xl border border-success/20 bg-success-soft p-5 text-center">
        <CheckCircle2 className="mx-auto text-success" size={30} />
        <p className="mt-2 text-sm font-semibold text-success">{state.message}</p>
        <Link
          href={`/track?ref=${orderNumber}`}
          className="mt-3 inline-block text-sm font-medium text-brand-600"
        >
          Track your order →
        </Link>
      </div>
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // Local preview only — the file is not uploaded until the form submits.
    const url = URL.createObjectURL(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="order_number" value={orderNumber} />

      <Field
        label="Transaction ID"
        htmlFor="txn_id"
        required
        hint={`The ID in your ${label} confirmation SMS, e.g. 9F2K3LM8QP`}
        error={state.fieldErrors?.txn_id}
      >
        <Input
          id="txn_id"
          name="txn_id"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="9F2K3LM8QP"
          className="uppercase tabular"
          invalid={Boolean(state.fieldErrors?.txn_id)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`${label} number you sent from`}
          htmlFor="sender_msisdn"
          required
          error={state.fieldErrors?.sender_msisdn}
        >
          <Input
            id="sender_msisdn"
            name="sender_msisdn"
            required
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            invalid={Boolean(state.fieldErrors?.sender_msisdn)}
          />
        </Field>

        <Field
          label="Mobile number on the order"
          htmlFor="phone"
          required
          hint="Confirms the order is yours"
          error={state.fieldErrors?.phone}
        >
          <Input
            id="phone"
            name="phone"
            required
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            invalid={Boolean(state.fieldErrors?.phone)}
          />
        </Field>
      </div>

      <div>
        <span className="block text-sm font-medium text-ink-soft">
          Payment screenshot
        </span>
        <p className="mt-0.5 text-xs text-ink-muted">
          Strongly recommended — it is the fastest way for us to verify. JPG, PNG
          or WebP, up to 5 MB.
        </p>

        <input
          ref={fileRef}
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="sr-only"
        />

        {preview ? (
          <div className="mt-2 flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected payment screenshot"
              className="size-20 shrink-0 rounded-lg border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              <button
                type="button"
                onClick={clearFile}
                className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-danger"
              >
                <X size={12} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="screenshot"
            className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40"
          >
            <Upload size={20} className="text-ink-faint" />
            <span className="text-sm font-medium text-ink">
              Tap to attach a screenshot
            </span>
            <span className="flex items-center gap-1 text-xs text-ink-muted">
              <ImageIcon size={11} />
              From your {label} app
            </span>
          </label>
        )}

        {state.fieldErrors?.screenshot ? (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {state.fieldErrors.screenshot}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending}>
        Submit payment details
      </Button>
    </form>
  );
}
