"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what correlates this with the server log entry.
    console.error("Unhandled error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={28} />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        This one is on us. Try again — if it keeps happening, give us a call and quote
        the reference below.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-ink-faint tabular">Reference {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-2.5">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
