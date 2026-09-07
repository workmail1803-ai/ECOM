/**
 * The one place paisa becomes a human-readable number.
 *
 * Everything upstream — database columns, quote payloads, order rows — is
 * integer paisa. Dividing by 100 anywhere else in the codebase is a bug.
 */

const TAKA = "৳"; // ৳ BENGALI RUPEE SIGN

/**
 * `12345678` → `"৳1,23,456.78"`? No — Bidyut renders in the international
 * grouping customers see on every other BD storefront: `"৳1,23,456"` is
 * confusing next to bKash receipts, so we use `en-US` grouping with a ৳ sign.
 *
 * Paisa are dropped unless they are non-zero, because BD retail prices are
 * whole taka in practice and a trailing `.00` is noise on a product grid.
 */
export function formatTaka(
  paisa: number | null | undefined,
  opts: { showPaisa?: boolean; withSymbol?: boolean } = {},
): string {
  const { showPaisa, withSymbol = true } = opts;
  const value = Math.round(paisa ?? 0) / 100;
  const needsPaisa = showPaisa ?? !Number.isInteger(value);

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: needsPaisa ? 2 : 0,
    maximumFractionDigits: needsPaisa ? 2 : 0,
  }).format(value);

  return withSymbol ? `${TAKA}${formatted}` : formatted;
}

/** Compact form for dashboard tiles: `৳1.2L`, `৳45.6K`. */
export function formatTakaCompact(paisa: number | null | undefined): string {
  const taka = Math.round(paisa ?? 0) / 100;
  if (taka >= 10_000_000) return `${TAKA}${(taka / 10_000_000).toFixed(2)}Cr`;
  if (taka >= 100_000) return `${TAKA}${(taka / 100_000).toFixed(2)}L`;
  if (taka >= 1_000) return `${TAKA}${(taka / 1_000).toFixed(1)}K`;
  return formatTaka(paisa);
}

/**
 * Percent off, rounded down so we never overstate a discount.
 * Returns null when there is nothing legitimate to strike through.
 */
export function discountPercent(
  pricePaisa: number,
  compareAtPaisa: number | null | undefined,
): number | null {
  if (!compareAtPaisa || compareAtPaisa <= pricePaisa) return null;
  return Math.floor(((compareAtPaisa - pricePaisa) / compareAtPaisa) * 100);
}

/** Taka (as typed by an admin) → paisa. Used by admin forms only. */
export function takaToPaisa(taka: string | number): number {
  const n = typeof taka === "string" ? Number.parseFloat(taka) : taka;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Paisa → taka, for pre-filling an admin form input. */
export function paisaToTaka(paisa: number | null | undefined): string {
  if (paisa == null) return "";
  return (paisa / 100).toString();
}

export { TAKA };
