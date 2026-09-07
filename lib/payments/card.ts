import type { PaymentProvider, PaymentInitInput, PaymentInitResult } from "./types";

/**
 * Card / mobile-banking aggregator, implemented against SSLCOMMERZ — the
 * gateway most Bangladeshi merchants actually get approved for.
 *
 * We never see, store or transmit a card number: SSLCOMMERZ hosts the payment
 * page and returns a `GatewayPageURL` we redirect to. That is deliberate and
 * non-negotiable — the moment card data touches this server, PCI scope lands
 * on it.
 */

function config() {
  return {
    baseUrl: process.env.CARD_GATEWAY_BASE_URL?.replace(/\/+$/, "") ?? "",
    storeId: process.env.CARD_GATEWAY_STORE_ID ?? "",
    storePassword: process.env.CARD_GATEWAY_STORE_PASSWORD ?? "",
  };
}

export const cardProvider: PaymentProvider = {
  id: "card",
  label: "Card / internet banking",
  description: "Visa, Mastercard, AMEX and every major BD bank.",
  icon: "CreditCard",

  isConfigured() {
    const c = config();
    return Boolean(c.baseUrl && c.storeId && c.storePassword);
  },

  async initiate(input: PaymentInitInput): Promise<PaymentInitResult> {
    try {
      const { baseUrl, storeId, storePassword } = config();

      // SSLCOMMERZ takes form-encoded input, not JSON.
      const form = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePassword,
        total_amount: (input.amountPaisa / 100).toFixed(2),
        currency: "BDT",
        tran_id: input.orderNumber,
        success_url: `${input.callbackUrl}&result=success`,
        fail_url: `${input.callbackUrl}&result=fail`,
        cancel_url: `${input.callbackUrl}&result=cancel`,
        cus_name: input.customerName,
        cus_email: input.customerEmail ?? "noreply@nazmul.com.bd",
        cus_phone: input.customerPhone,
        cus_add1: "N/A",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        shipping_method: "Courier",
        product_name: `Order ${input.orderNumber}`,
        product_category: "Electronics",
        product_profile: "physical-goods",
      });

      const res = await fetch(`${baseUrl}/gwprocess/v4/api.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
      });

      const data = (await res.json()) as {
        status?: string;
        GatewayPageURL?: string;
        sessionkey?: string;
        failedreason?: string;
      };

      if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
        return {
          kind: "error",
          message: data.failedreason ?? "The card gateway could not start this payment.",
        };
      }

      return {
        kind: "redirect",
        url: data.GatewayPageURL,
        providerRef: data.sessionkey ?? input.orderNumber,
      };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "The card gateway is unavailable.",
      };
    }
  },
};
