import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Public store configuration, seeded by migration 0013 and editable at
 * /admin/settings.
 *
 * RLS only exposes rows with `is_public`, so this is safe to call from any
 * storefront component. Nothing here is hardcoded in React — that is the whole
 * point of the settings table.
 */

export interface StoreSettings {
  store_name: string;
  store_tagline: string;
  store_description: string;
  support_phone: string;
  support_whatsapp: string;
  support_email: string;
  support_hours: string;
  showroom_address: string;
  social_links: { facebook?: string; instagram?: string; youtube?: string };
  currency: { code: string; symbol: string; locale: string };
  cod_advance_threshold_paisa: number;
  return_window_days: number;
  warranty_note: string;
  low_stock_banner_threshold: number;
}

/** Used when the settings row is missing so the UI still renders sensibly. */
const FALLBACK: StoreSettings = {
  store_name: "Nazmul",
  store_tagline: "Electronics, honestly priced.",
  store_description:
    "Nazmul is a Dhaka-based electronics retailer delivering nationwide.",
  support_phone: "+8801812345678",
  support_whatsapp: "+8801812345678",
  support_email: "support@nazmul.com.bd",
  support_hours: "Saturday–Thursday, 10:00–20:00",
  showroom_address: "Panthapath, Dhaka",
  social_links: {},
  currency: { code: "BDT", symbol: "৳", locale: "en-BD" },
  cod_advance_threshold_paisa: 5_000_000,
  return_window_days: 7,
  warranty_note: "",
  low_stock_banner_threshold: 5,
};

export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");

  const rows = (data as { key: string; value: unknown }[] | null) ?? [];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return { ...FALLBACK, ...map } as StoreSettings;
});

export const getDeliveryZones = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("delivery_zones")
    .select("*")
    .eq("is_active", true)
    .order("position");
  return data ?? [];
});
