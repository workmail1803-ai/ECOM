"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveInternalNote } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Staff-only note. RLS keeps `internal_note` off every customer-facing read. */
export function InternalNote({
  orderId,
  note,
}: {
  orderId: string;
  note: string;
}) {
  const [value, setValue] = useState(note);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const result = await saveInternalNote(orderId, value);
      result.ok
        ? toast.success(result.message ?? "Saved.")
        : toast.error(result.error ?? "Could not save.");
    });
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Internal note</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Staff only — never shown to the customer.
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="mt-2 text-sm"
        placeholder="Called customer, confirmed address."
        aria-label="Internal note"
      />
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={save}
        disabled={value === note}
        className="mt-2"
      >
        Save note
      </Button>
    </Card>
  );
}
