import "server-only";

import type { PaymentMethod } from "@/types/database";
import type { PaymentProvider } from "./types";
import { codProvider } from "./cod";
import { bkashProvider } from "./bkash";
import { nagadProvider } from "./nagad";
import { cardProvider } from "./card";

export type { PaymentProvider, PaymentInitInput, PaymentInitResult } from "./types";

const ALL_PROVIDERS: Record<string, PaymentProvider> = {
  cod: codProvider,
  bkash: bkashProvider,
  nagad: nagadProvider,
  card: cardProvider,
};

/**
 * Providers the operator has switched on, intersected with the ones that
 * actually have credentials.
 *
 * Two gates on purpose. `PAYMENTS_ENABLED_PROVIDERS` is the business decision
 * ("we are live on bKash"); `isConfigured()` is the technical reality ("the
 * keys are present"). A provider missing either is hidden, never shown broken.
 */
export function enabledProviders(): PaymentProvider[] {
  const allowed = (process.env.PAYMENTS_ENABLED_PROVIDERS ?? "cod")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allowed
    .map((id) => ALL_PROVIDERS[id])
    .filter((p): p is PaymentProvider => Boolean(p) && p.isConfigured());
}

export function getProvider(id: PaymentMethod): PaymentProvider | null {
  const provider = ALL_PROVIDERS[id];
  if (!provider || !provider.isConfigured()) return null;

  const allowed = (process.env.PAYMENTS_ENABLED_PROVIDERS ?? "cod")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return allowed.includes(id) ? provider : null;
}

/**
 * Serialisable shape for the checkout client component. The provider objects
 * themselves hold closures over secrets and must not cross the boundary.
 */
export interface PaymentOption {
  id: PaymentMethod;
  label: string;
  description: string;
  icon: string;
}

export function paymentOptions(): PaymentOption[] {
  return enabledProviders().map(({ id, label, description, icon }) => ({
    id,
    label,
    description,
    icon,
  }));
}
