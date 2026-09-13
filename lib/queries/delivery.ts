import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryOption } from "@/components/checkout/delivery-options";

/**
 * The delivery options a shopper can pick from.
 *
 * Read from `delivery_zones` rather than hardcoded, so re-pricing delivery is
 * an admin edit and not a deploy. The storefront shows these on the product
 * page, in the cart and at checkout, and every one of those places gets the
 * same numbers from here.
 */
export const getDeliveryOptions = cache(async (): Promise<DeliveryOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("delivery_zones")
    .select("slug, name, fee_paisa, min_days, max_days")
    .eq("is_active", true)
    .order("position");

  const rows =
    (data as
      | {
          slug: string;
          name: string;
          fee_paisa: number;
          min_days: number;
          max_days: number;
        }[]
      | null) ?? [];

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    feePaisa: r.fee_paisa,
    minDays: r.min_days,
    maxDays: r.max_days,
  }));
});
