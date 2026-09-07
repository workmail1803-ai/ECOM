"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Fire-and-forget view tracking. Silent by design: a failed analytics write
 * must never surface as an error on a product page.
 */
export async function recordProductView(productId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("record_product_view", { p_product_id: productId });
}
