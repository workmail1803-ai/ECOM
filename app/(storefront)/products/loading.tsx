import { ProductCardSkeleton } from "@/components/product/product-card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton mt-2 h-4 w-32 rounded" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="skeleton hidden h-96 rounded-xl lg:block" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
