/**
 * Site theme shape, defaults and validation.
 *
 * Deliberately free of any server import. The admin design form is a Client
 * Component and needs COLOR_FIELDS and FONT_CHOICES to render; when these
 * lived beside the Supabase query, importing them dragged `next/headers` into
 * the client bundle and the build failed. Reading the stored theme lives in
 * lib/queries/theme.ts, which is server-only.
 *
 * Site theme, controlled from /admin/design.
 *
 * The whole design system is already CSS custom properties in globals.css, so
 * "give the admin control of the look" needs no new table and no rebuild: the
 * stored values are emitted as a `:root` override in the document head and the
 * cascade does the rest. Every component keeps using `text-ink` or
 * `bg-brand-600` and picks up the change for free.
 *
 * Fonts are a CHOICE from a fixed list rather than free text. next/font
 * subsets and self-hosts at build time, which is what keeps them off the
 * critical path — a font named at runtime could not be subset, would cost a
 * blocking request to a third party, and would flash. The list below is the
 * set that is actually compiled in.
 */

export const FONT_CHOICES = [
  { id: "sora", label: "Sora — geometric, technical" },
  { id: "jakarta", label: "Plus Jakarta Sans — warm, modern" },
  { id: "inter", label: "Inter — neutral, classic UI" },
  { id: "outfit", label: "Outfit — rounded, friendly" },
  { id: "space", label: "Space Grotesk — quirky, distinctive" },
  { id: "manrope", label: "Manrope — clean, geometric" },
] as const;

export type FontChoice = (typeof FONT_CHOICES)[number]["id"];

export const COLOR_FIELDS = [
  { key: "brand600", label: "Primary", hint: "Buttons, links, active states" },
  { key: "brand700", label: "Primary (hover)", hint: "Darker press state" },
  { key: "ink", label: "Text", hint: "Headings and body copy" },
  { key: "surface", label: "Surface", hint: "Cards and panels" },
  { key: "surfaceSunken", label: "Page background", hint: "Behind the cards" },
  { key: "danger", label: "Sale / danger", hint: "Discounts, errors, the Sale row" },
  { key: "success", label: "Success", hint: "In stock, delivered, confirmations" },
  { key: "warning", label: "Warning", hint: "Pending states and low stock" },
] as const;

export type ColorKey = (typeof COLOR_FIELDS)[number]["key"];

export interface SiteTheme {
  headingFont: FontChoice;
  bodyFont: FontChoice;
  /** Hex, `#rrggbb`. */
  colors: Record<ColorKey, string>;
  /** Corner rounding for cards and buttons, in rem. */
  radius: number;
}

/**
 * The compiled-in default — identical to what globals.css already ships, so an
 * untouched store renders exactly as designed and the override is a no-op.
 */
export const DEFAULT_THEME: SiteTheme = {
  headingFont: "sora",
  bodyFont: "jakarta",
  colors: {
    brand600: "#1b4dff",
    brand700: "#1540d6",
    ink: "#14161a",
    surface: "#ffffff",
    surfaceSunken: "#f7f7f5",
    danger: "#e11d48",
    success: "#0f9d58",
    warning: "#c2820a",
  },
  radius: 0.75,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Anything stored is untrusted: a bad hex would emit broken CSS site-wide. */
export function sanitiseTheme(raw: unknown): SiteTheme {
  const v = (raw ?? {}) as Partial<SiteTheme>;
  const fonts = new Set(FONT_CHOICES.map((f) => f.id as string));

  const colors = { ...DEFAULT_THEME.colors };
  const given = (v.colors ?? {}) as Record<string, unknown>;
  for (const { key } of COLOR_FIELDS) {
    const candidate = given[key];
    if (typeof candidate === "string" && HEX.test(candidate)) {
      colors[key] = candidate.toLowerCase();
    }
  }

  const radius = Number(v.radius);

  return {
    headingFont: fonts.has(String(v.headingFont))
      ? (v.headingFont as FontChoice)
      : DEFAULT_THEME.headingFont,
    bodyFont: fonts.has(String(v.bodyFont))
      ? (v.bodyFont as FontChoice)
      : DEFAULT_THEME.bodyFont,
    colors,
    // Clamp rather than reject: a 40rem radius turns every card into a circle.
    radius:
      Number.isFinite(radius) && radius >= 0 && radius <= 2
        ? radius
        : DEFAULT_THEME.radius,
  };
}

/**
 * The `:root` block that overrides globals.css.
 *
 * Only the tokens an admin can actually change are emitted — everything else
 * stays exactly as authored. Values are already validated as `#rrggbb` by
 * `sanitiseTheme`, so nothing here can break out of the declaration.
 */
export function themeToCss(theme: SiteTheme): string {
  const c = theme.colors;
  return `:root{--color-brand-600:${c.brand600};--color-brand-700:${c.brand700};--color-ink:${c.ink};--color-surface:${c.surface};--color-surface-sunken:${c.surfaceSunken};--color-danger:${c.danger};--color-success:${c.success};--color-warning:${c.warning};--radius-card:${theme.radius}rem;}`;
}
