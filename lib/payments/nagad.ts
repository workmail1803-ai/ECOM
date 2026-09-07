import crypto from "node:crypto";
import type { PaymentProvider, PaymentInitInput, PaymentInitResult } from "./types";

/**
 * Nagad Payment Gateway.
 *
 * Nagad is the awkward one: the initialise call is signed with the merchant's
 * RSA private key and the sensitive block is encrypted with Nagad's public key.
 * Both keys arrive from the dashboard as bare base64 without PEM armour, so we
 * add it here rather than asking an operator to format a key correctly in a
 * .env file.
 */

function config() {
  return {
    baseUrl: process.env.NAGAD_BASE_URL?.replace(/\/+$/, "") ?? "",
    merchantId: process.env.NAGAD_MERCHANT_ID ?? "",
    merchantNumber: process.env.NAGAD_MERCHANT_NUMBER ?? "",
    publicKey: process.env.NAGAD_PUBLIC_KEY ?? "",
    privateKey: process.env.NAGAD_PRIVATE_KEY ?? "",
  };
}

function armour(key: string, kind: "PUBLIC" | "PRIVATE"): string {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${kind} KEY-----\n${body}\n-----END ${kind} KEY-----`;
}

function encrypt(payload: string): string {
  return crypto
    .publicEncrypt(
      { key: armour(config().publicKey, "PUBLIC"), padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(payload),
    )
    .toString("base64");
}

function sign(payload: string): string {
  return crypto
    .createSign("SHA1")
    .update(payload)
    .sign(armour(config().privateKey, "PRIVATE"), "base64");
}

/** Nagad wants `YYYYMMDDHHmmss` in Asia/Dhaka. */
function nagadTimestamp(now: Date): string {
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return dhaka.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

export const nagadProvider: PaymentProvider = {
  id: "nagad",
  label: "Nagad",
  description: "Pay from your Nagad account.",
  icon: "Wallet",

  isConfigured() {
    const c = config();
    return Boolean(c.baseUrl && c.merchantId && c.publicKey && c.privateKey);
  },

  async initiate(input: PaymentInitInput): Promise<PaymentInitResult> {
    try {
      const { baseUrl, merchantId } = config();
      const now = new Date();
      const dateTime = nagadTimestamp(now);
      // Nagad requires a unique, merchant-scoped order id per attempt.
      const orderRef = `${input.orderNumber}-${now.getTime().toString(36)}`.toUpperCase();

      const sensitive = {
        merchantId,
        datetime: dateTime,
        orderId: orderRef,
        challenge: crypto.randomBytes(16).toString("hex"),
      };
      const sensitiveJson = JSON.stringify(sensitive);

      const initRes = await fetch(
        `${baseUrl}/api/dfs/check-out/initialize/${merchantId}/${orderRef}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-KM-Api-Version": "v-0.2.0",
            "X-KM-IP-V4": "0.0.0.0",
            "X-KM-Client-Type": "PC_WEB",
          },
          body: JSON.stringify({
            accountNumber: input.customerPhone,
            dateTime,
            sensitiveData: encrypt(sensitiveJson),
            signature: sign(sensitiveJson),
          }),
          cache: "no-store",
        },
      );

      const init = (await initRes.json()) as {
        sensitiveData?: string;
        signature?: string;
        reason?: string;
        message?: string;
      };

      if (!init.sensitiveData || !init.signature) {
        return {
          kind: "error",
          message: init.message ?? init.reason ?? "Nagad could not start this payment.",
        };
      }

      const decrypted = crypto
        .privateDecrypt(
          {
            key: armour(config().privateKey, "PRIVATE"),
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          Buffer.from(init.sensitiveData, "base64"),
        )
        .toString();
      const { paymentReferenceId, challenge } = JSON.parse(decrypted) as {
        paymentReferenceId: string;
        challenge: string;
      };

      const orderSensitive = JSON.stringify({
        merchantId,
        orderId: orderRef,
        currencyCode: "050", // BDT
        amount: (input.amountPaisa / 100).toFixed(2),
        challenge,
      });

      const completeRes = await fetch(
        `${baseUrl}/api/dfs/check-out/complete/${paymentReferenceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-KM-Api-Version": "v-0.2.0",
            "X-KM-IP-V4": "0.0.0.0",
            "X-KM-Client-Type": "PC_WEB",
          },
          body: JSON.stringify({
            sensitiveData: encrypt(orderSensitive),
            signature: sign(orderSensitive),
            merchantCallbackURL: input.callbackUrl,
            additionalMerchantInfo: { orderNumber: input.orderNumber },
          }),
          cache: "no-store",
        },
      );

      const complete = (await completeRes.json()) as {
        callBackUrl?: string;
        status?: string;
        message?: string;
      };

      if (!complete.callBackUrl) {
        return {
          kind: "error",
          message: complete.message ?? "Nagad rejected this payment.",
        };
      }

      return {
        kind: "redirect",
        url: complete.callBackUrl,
        providerRef: paymentReferenceId,
      };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "Nagad is unavailable.",
      };
    }
  },
};
