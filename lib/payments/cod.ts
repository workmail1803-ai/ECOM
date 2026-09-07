import type { PaymentProvider } from "./types";

/**
 * Cash on delivery.
 *
 * There is no gateway call. The order is placed with payment_status 'pending'
 * and only becomes 'successful' when an admin marks the order delivered —
 * `update_order_status()` does that transition in SQL, not here.
 */
export const codProvider: PaymentProvider = {
  id: "cod",
  label: "Cash on delivery",
  description: "Pay the courier when your order arrives. No advance needed.",
  icon: "Banknote",

  // COD needs no credentials, so it is always available.
  isConfigured: () => true,

  async initiate() {
    return {
      kind: "settled",
      message: "Your order is confirmed. Pay the courier on delivery.",
    };
  },
};
