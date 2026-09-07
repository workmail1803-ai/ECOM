"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Archive } from "lucide-react";
import { setProductStatus } from "@/lib/actions/admin";

/**
 * Publish / unpublish / archive. Archive rather than delete, because
 * order_items reference products by id and an invoice must stay readable.
 */
export function ProductStatusToggle({
  id,
  status,
}: {
  id: string;
  status: "draft" | "active" | "archived";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function change(next: "draft" | "active" | "archived") {
    start(async () => {
      const result = await setProductStatus(id, next);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(result.message ?? "Updated.");
      router.refresh();
    });
  }

  if (status === "archived") {
    return (
      <button
        onClick={() => change("draft")}
        disabled={pending}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
        title="Restore to draft"
        aria-label="Restore to draft"
      >
        <Archive size={15} />
      </button>
    );
  }

  const publishing = status !== "active";

  return (
    <button
      onClick={() => change(publishing ? "active" : "draft")}
      disabled={pending}
      className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
      title={publishing ? "Publish" : "Unpublish"}
      aria-label={publishing ? "Publish product" : "Unpublish product"}
    >
      {publishing ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}
