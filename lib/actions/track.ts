"use server";

import { createClient } from "@/lib/supabase/server";
import { trackOrderSchema } from "@/lib/validations/checkout";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/types/database";

/**
 * Guest order tracking.
 *
 * Order numbers come from a sequence, so they are guessable. `track_order()`
 * requires the phone number on the order as a second factor and returns only
 * the fields this page renders — never the internal note or any cost figure.
 */

export interface TrackedOrder {
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  placed_at: string;
  customer_name: string;
  delivery_zone_name: string;
  delivery_min_days: number;
  delivery_max_days: number;
  shipping_area: string;
  shipping_district: string;
  subtotal_paisa: number;
  discount_paisa: number;
  delivery_fee_paisa: number;
  total_paisa: number;
  items: {
    product_name: string;
    variant_name: string | null;
    image_url: string | null;
    quantity: number;
    unit_price_paisa: number;
    line_total_paisa: number;
  }[];
  history: { status: OrderStatus; note: string | null; created_at: string }[];
}

export interface TrackState {
  ok: boolean;
  error?: string;
  order?: TrackedOrder;
}

export async function trackOrder(
  _prev: TrackState,
  formData: FormData,
): Promise<TrackState> {
  const parsed = trackOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the order number and mobile number." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("track_order", {
    p_order_number: parsed.data.order_number,
    p_phone: parsed.data.phone,
  });

  if (error) return { ok: false, error: "We could not look that order up." };

  // The RPC returns null for both "no such order" and "wrong phone" — one
  // message for both, so this cannot be used to confirm an order exists.
  if (!data) {
    return {
      ok: false,
      error:
        "No order matches that number and mobile number. Check both and try again.",
    };
  }

  return { ok: true, order: data as TrackedOrder };
}
