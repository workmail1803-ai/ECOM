import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge, Rating } from "@/components/ui/primitives";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { formatTaka, discountPercent } from "@/lib/utils/money";
import { averageRating, type ProductCard as ProductCardData } from "@/lib/queries/catalog";
import { cn } from "@/lib/utils/cn";

/**
 * The storefront's atom. Rendered in grids, rails and search results.
 *
 * A Server Component apart from the add-to-cart button, so a 24-product grid
 * ships almost no JavaScript.
 */
export function ProductCard({
  product,
  className,
  priority = false,
}: {
  product: ProductCardData;
  className?: string;
  priority?: boolean;
}) {
  const off = discountPercent(product.price_paisa, product.compare_at_paisa);
  const rating = averageRating(product);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= (product.low_stock_threshold ?? 5);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-lift",
        className,
      )}
    >
      <Link
        href={`/products/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-surface-sunken"
      >
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 45vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-faint">
            <ImageOff size={28} />
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {off ? <Badge tone="sale">-{off}%</Badge> : null}
          {product.is_new_arrival && !off ? <Badge tone="brand">New</Badge> : null}
        </div>

        {outOfStock ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70">
            <span className="rounded-md bg-ink px-2 py-1 text-xs font-medium text-white">
              Out of stock
            </span>
          </div>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/products/${product.slug}`} className="min-h-10">
          <h3 className="clamp-2 text-sm font-medium leading-5 text-ink group-hover:text-brand-700">
            {product.name}
          </h3>
        </Link>

        <Rating value={rating} count={product.rating_count || undefined} />

        <div className="mt-auto flex items-baseline gap-2">
          <span className="tabular text-base font-semibold text-ink">
            {formatTaka(product.price_paisa)}
          </span>
          {product.compare_at_paisa ? (
            <span className="tabular text-xs text-ink-faint line-through">
              {formatTaka(product.compare_at_paisa)}
            </span>
          ) : null}
        </div>

        {lowStock ? (
          <p className="text-[11px] font-medium text-warning">
            Only {product.stock} left
          </p>
        ) : null}

        <AddToCartButton
          productId={product.id}
          disabled={outOfStock}
          size="sm"
          block
          label="Add to cart"
        />
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="skeleton aspect-square" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-5 w-1/3 rounded" />
        <div className="skeleton h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}
