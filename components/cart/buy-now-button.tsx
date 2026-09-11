"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { addToCart } from "@/lib/actions/cart";

/**
 * Add to cart, then go straight to checkout.
 *
 * Same server action as the cart button — there is no separate "instant buy"
 * path, because a second way to create an order would be a second place for
 * pricing to drift. This is add-to-cart plus a redirect.
 *
 * The pending state is held until navigation begins, so the button cannot be
 * double-fired into two cart lines while the route loads.
 */
export function BuyNowButton({
  productId,
  variantId,
  quantity = 1,
  disabled,
  label = "Buy now",
  size = "md",
  variant = "primary",
  block,
}: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  disabled?: boolean;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  block?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onClick() {
    start(async () => {
      const result = await addToCart({ productId, variantId, quantity });

      if (!result.ok) {
        toast.error(result.error ?? "Could not start checkout.");
        return;
      }
      // Clamped to available stock — worth saying before they reach checkout
      // and wonder why the quantity changed.
      if (result.notice) toast.warning(result.notice);

      router.push("/checkout");
    });
  }

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      loading={pending}
      size={size}
      variant={variant}
      block={block}
      aria-label={disabled ? "Out of stock" : label}
    >
      {!pending ? <Zap /> : null}
      {disabled ? "Out of stock" : label}
    </Button>
  );
}
