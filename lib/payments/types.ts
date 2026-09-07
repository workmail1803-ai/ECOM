import type { PaymentMethod } from "@/types/database";

/**
 * The only interface checkout knows about.
 *
 * CLAUDE.md rule 5: no payment-provider branch may exist outside lib/payments.
 * If you find yourself writing `if (method === "bkash")` in a component or a
 * server action, the logic belongs in a provider instead.
 */

export interface PaymentInitInput {
  orderId: string;
  orderNumber: string;
  /** Authoritative amount, read from the order row — never from the client. */
  amountPaisa: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  /** Absolute URL the gateway sends the customer back to. */
  callbackUrl: string;
}

export type PaymentInitResult =
  /** COD: nothing to do, the order is already actionable. */
  | { kind: "settled"; message: string }
  /** Online: send the customer to the gateway. */
  | { kind: "redirect"; url: string; providerRef: string }
  | { kind: "error"; message: string };

export interface PaymentProvider {
  id: PaymentMethod;
  /** Shown on the checkout radio. */
  label: string;
  description: string;
  /** Lucide icon name, resolved by the checkout UI. */
  icon: string;
  /**
   * False when credentials are missing. A provider that is not configured is
   * hidden at checkout — never rendered as a dead option (CLAUDE.md rule 6).
   */
  isConfigured(): boolean;
  initiate(input: PaymentInitInput): Promise<PaymentInitResult>;
}
