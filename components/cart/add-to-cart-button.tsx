"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShoppingCart, Check } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { addToCart } from "@/lib/actions/cart";

/**
 * The only way an item enters a cart.
 *
 * Note there is no price anywhere in this component. It sends ids; the server
 * decides what anything costs.
 */
export function AddToCartButton({
  productId,
  variantId,
  quantity = 1,
  disabled,
  label = "Add to cart",
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
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const result = await addToCart({ productId, variantId, quantity });

      if (!result.ok) {
        toast.error(result.error ?? "Could not add that to your cart.");
        return;
      }

      if (result.notice) toast.warning(result.notice);
      else toast.success("Added to cart");

      setAdded(true);
      setTimeout(() => setAdded(false), 1600);

      // Refresh so the header cart count reflects the new quote.
      router.refresh();
    });
  }

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      loading={pending}
      size={size}
      variant={disabled ? "outline" : variant}
      block={block}
      aria-label={disabled ? "Out of stock" : label}
    >
      {!pending ? added ? <Check /> : <ShoppingCart /> : null}
      {disabled ? "Out of stock" : added ? "Added" : label}
    </Button>
  );
}
