import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-surface-sunken text-ink-faint">
        <SearchX size={28} />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
        We could not find that page
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        The link may be old, or the product may have been archived. The catalogue is
        one click away.
      </p>
      <div className="mt-6 flex gap-2.5">
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
        <Button asChild>
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    </div>
  );
}
