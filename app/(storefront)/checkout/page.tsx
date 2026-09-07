import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCartQuote } from "@/lib/actions/cart";
import { getSessionUser } from "@/lib/auth/session";
import { getStoreSettings } from "@/lib/queries/settings";
import { createClient } from "@/lib/supabase/server";
import { paymentOptions } from "@/lib/payments";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import type { Address } from "@/types/database";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const quote = await getCartQuote();

  // Nothing to buy, or something in the cart went out of stock — send them back
  // rather than letting place_order() fail after they have typed an address.
  if (quote.lines.length === 0) redirect("/cart");
  if (quote.has_blocking_issue) redirect("/cart");

  const [user, settings] = await Promise.all([getSessionUser(), getStoreSettings()]);

  let addresses: Address[] = [];
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    addresses = (data as Address[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Checkout</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Delivery charges are calculated from your district. Nothing is charged until
        you place the order.
      </p>

      <CheckoutForm
        initialQuote={quote}
        addresses={addresses}
        paymentOptions={paymentOptions()}
        signedIn={Boolean(user)}
        defaultName={user?.profile?.full_name ?? ""}
        defaultPhone={user?.profile?.phone ?? ""}
        defaultEmail={user?.email ?? ""}
        codAdvanceThresholdPaisa={settings.cod_advance_threshold_paisa}
      />
    </div>
  );
}
