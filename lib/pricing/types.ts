/**
 * The shape returned by the `quote_cart()` SQL function
 * (supabase/migrations/0008_pricing.sql).
 *
 * This is the ONLY authoritative price breakdown in the system. React may
 * render these numbers; it may never compute or submit them. `place_order()`
 * re-runs the same quote server-side and ignores whatever the client thought
 * the total was.
 */

/** Why a line cannot be checked out. `null` means the line is fine. */
export type LineIssue = "unavailable" | "out_of_stock" | "insufficient_stock";

/** Why a coupon code was rejected. `null` means it applied cleanly. */
export type CouponError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "already_used"
  | "not_applicable"
  | "min_order";

export interface QuoteLine {
  cart_item_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  product_slug: string;
  variant_name: string | null;
  sku: string;
  image_url: string | null;
  category_id: string | null;
  /** What the customer asked for. */
  quantity: number;
  /** What we can actually ship. */
  available_stock: number;
  unit_price_paisa: number;
  compare_at_paisa: number | null;
  /**
   * Already accounts for `issue`: zero for an unavailable line, and priced at
   * `available_stock` for a short one. Never recompute this from quantity.
   */
  line_total_paisa: number;
  is_flash_sale: boolean;
  issue: LineIssue | null;
}

export interface QuoteCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
}

export interface QuoteZone {
  id: string;
  name: string;
  slug: string;
  fee_paisa: number;
  free_above_paisa: number | null;
  min_days: number;
  max_days: number;
}

export interface CartQuote {
  cart_id: string | null;
  lines: QuoteLine[];
  /** Sum of shippable units, not line count. */
  item_count: number;
  subtotal_paisa: number;
  discount_paisa: number;
  delivery_fee_paisa: number;
  /** Always equals subtotal - discount + delivery. Enforced by a CHECK on orders. */
  total_paisa: number;
  coupon: QuoteCoupon | null;
  coupon_code_attempted: string | null;
  coupon_error: CouponError | null;
  /** Null until a district is known — the cart page has no address yet. */
  delivery_zone: QuoteZone | null;
  /** True when at least one line has an `issue`. Blocks checkout. */
  has_blocking_issue: boolean;
}

/** Used when there is no cart at all, so the UI never branches on null. */
export const EMPTY_QUOTE: CartQuote = {
  cart_id: null,
  lines: [],
  item_count: 0,
  subtotal_paisa: 0,
  discount_paisa: 0,
  delivery_fee_paisa: 0,
  total_paisa: 0,
  coupon: null,
  coupon_code_attempted: null,
  coupon_error: null,
  delivery_zone: null,
  has_blocking_issue: false,
};

/** Human copy for a rejected coupon. Keyed by the DB's error string. */
export const COUPON_ERROR_MESSAGE: Record<CouponError, string> = {
  not_found: "We could not find that coupon code.",
  inactive: "That coupon is no longer active.",
  not_started: "That offer has not started yet.",
  expired: "That coupon has expired.",
  exhausted: "That coupon has been fully claimed.",
  already_used: "You have already used this coupon.",
  not_applicable: "This coupon does not apply to anything in your cart.",
  min_order: "Your order is below this coupon's minimum spend.",
};

/** Human copy for a blocked cart line. */
export const LINE_ISSUE_MESSAGE: Record<LineIssue, string> = {
  unavailable: "No longer available",
  out_of_stock: "Out of stock",
  insufficient_stock: "Not enough stock left",
};
