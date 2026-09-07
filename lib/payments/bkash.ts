import type { PaymentProvider, PaymentInitInput, PaymentInitResult } from "./types";

/**
 * bKash Tokenized Checkout (PGW v1.2.0).
 *
 * Flow: grant a short-lived id_token → create a payment → redirect the customer
 * to bKash → they return to our callback → we `execute` to capture the trxID.
 * The execute half lives in app/api/payments/bkash/callback, because only a
 * verified return may settle money.
 *
 * Amounts cross the wire in TAKA with two decimals, which is why every call
 * divides paisa by 100 exactly once, here.
 */

interface GrantResponse {
  id_token?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface CreateResponse {
  paymentID?: string;
  bkashURL?: string;
  statusCode?: string;
  statusMessage?: string;
}

function config() {
  return {
    baseUrl: process.env.BKASH_BASE_URL?.replace(/\/+$/, "") ?? "",
    appKey: process.env.BKASH_APP_KEY ?? "",
    appSecret: process.env.BKASH_APP_SECRET ?? "",
    username: process.env.BKASH_USERNAME ?? "",
    password: process.env.BKASH_PASSWORD ?? "",
  };
}

/** Cached until ~55 min; bKash tokens live an hour. */
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function grantToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const { baseUrl, appKey, appSecret, username, password } = config();
  const res = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username,
      password,
    },
    body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
    cache: "no-store",
  });

  const data = (await res.json()) as GrantResponse;
  if (!data.id_token) {
    throw new Error(
      `bKash token grant failed: ${data.statusMessage ?? res.status}`,
    );
  }

  tokenCache = { token: data.id_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return data.id_token;
}

/** Exported so the callback route can execute the payment it just received. */
export async function executePayment(paymentID: string) {
  const { baseUrl, appKey } = config();
  const token = await grantToken();

  const res = await fetch(`${baseUrl}/tokenized/checkout/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": appKey,
    },
    body: JSON.stringify({ paymentID }),
    cache: "no-store",
  });

  return (await res.json()) as {
    trxID?: string;
    transactionStatus?: string;
    amount?: string;
    statusCode?: string;
    statusMessage?: string;
  };
}

export const bkashProvider: PaymentProvider = {
  id: "bkash",
  label: "bKash",
  description: "Pay instantly from your bKash wallet.",
  icon: "Smartphone",

  isConfigured() {
    const c = config();
    return Boolean(
      c.baseUrl && c.appKey && c.appSecret && c.username && c.password,
    );
  },

  async initiate(input: PaymentInitInput): Promise<PaymentInitResult> {
    try {
      const { baseUrl, appKey } = config();
      const token = await grantToken();

      const res = await fetch(`${baseUrl}/tokenized/checkout/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token,
          "X-APP-Key": appKey,
        },
        body: JSON.stringify({
          mode: "0011", // checkout (no agreement)
          payerReference: input.customerPhone,
          callbackURL: input.callbackUrl,
          amount: (input.amountPaisa / 100).toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: input.orderNumber,
        }),
        cache: "no-store",
      });

      const data = (await res.json()) as CreateResponse;
      if (!data.paymentID || !data.bkashURL) {
        return {
          kind: "error",
          message: data.statusMessage ?? "bKash could not start this payment.",
        };
      }

      return { kind: "redirect", url: data.bkashURL, providerRef: data.paymentID };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "bKash is unavailable.",
      };
    }
  },
};
