import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { sanitiseTheme, type SiteTheme } from "@/lib/theme/schema";

/**
 * Read the stored theme.
 *
 * Server-only: it touches cookies through the Supabase client. The shape,
 * defaults and validation live in lib/theme/schema.ts so Client Components can
 * import those without dragging `next/headers` into the browser bundle.
 */
export const getSiteTheme = cache(async (): Promise<SiteTheme> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "site_theme")
    .maybeSingle();

  return sanitiseTheme((data as { value: unknown } | null)?.value);
});
