import type { Metadata } from "next";
import Link from "next/link";
import { XCircle, Phone } from "lucide-react";
import { getStoreSettings } from "@/lib/queries/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Payment not completed",
  robots: { index: false },
};

const REASONS: Record<string, string> = {
  missing_reference: "We could not identify that payment.",
  bad_signature: "That payment link could not be verified.",
  unknown_payment: "We could not find that payment.",
  unknown_provider: "That payment method is not supported.",
  settlement_failed: "We could not confirm the payment with the gateway.",
  payment_failed: "The gateway declined the payment.",
};

export default async function CheckoutFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; ref?: string }>;
}) {
  const { reason, ref } = await searchParams;
  const settings = await getStoreSettings();

  const message = reason ? (REASONS[reason] ?? reason) : "The payment did not go through.";

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <XCircle size={30} />
      </span>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
        Payment not completed
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>

      <Card className="mt-6 p-5 text-left">
        <p className="text-sm leading-6 text-ink-soft">
          {ref ? (
            <>
              Your order <span className="font-semibold tabular">{ref}</span> was not
              charged. Nothing has been taken from your account.
            </>
          ) : (
            "Nothing has been charged. Your cart is still where you left it."
          )}
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          You can try again, or place the order with cash on delivery instead — that
          works on every order nationwide.
        </p>
      </Card>

      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        <Button asChild size="lg" variant="outline">
          <Link href="/cart">Back to cart</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/checkout">Try again</Link>
        </Button>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
        <Phone size={13} />
        Stuck? Call {settings.support_phone}
      </p>
    </div>
  );
}
