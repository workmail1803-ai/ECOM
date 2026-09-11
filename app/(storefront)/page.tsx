import Link from "next/link";
import { Truck, ShieldCheck, MessageCircle, ArrowRight } from "lucide-react";
import { getHomeData } from "@/lib/queries/home";
import { getStoreSettings } from "@/lib/queries/settings";
import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/storefront/hero";
import { FlashSaleSection } from "@/components/storefront/flash-sale";
import { PromoTiles } from "@/components/storefront/promo-tiles";
import {
  Section,
  ProductGrid,
  ProductRail,
  CategoryGrid,
  OfferCards,
  WhyChooseUs,
  ReviewWall,
  type HomeReview,
} from "@/components/storefront/sections";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

// The homepage is the same for everyone; regenerate it every 5 minutes rather
// than querying Postgres on every visit. Flash-sale countdowns are client-side,
// so a slightly stale shell is still correct.
export const revalidate = 300;

/** Approved reviews with the product they belong to, for the social-proof rail. */
async function getHomeReviews(): Promise<HomeReview[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, title, body, created_at, product_id, user_id")
    .eq("status", "approved")
    .gte("rating", 4)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [{ data: products }, { data: profiles }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug")
      .in("id", rows.map((r) => r.product_id)),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", rows.map((r) => r.user_id)),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((r) => {
    const product = productById.get(r.product_id);
    const full = nameById.get(r.user_id) ?? "Verified buyer";
    // Surname-initial only — a review wall is not a place to publish full names.
    const [first, ...rest] = String(full).split(" ");
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      author: rest.length ? `${first} ${rest.at(-1)![0]}.` : first!,
      product_name: product?.name ?? null,
      product_slug: product?.slug ?? null,
    };
  });
}

export default async function HomePage() {
  const [home, settings, reviews] = await Promise.all([
    getHomeData(),
    getStoreSettings(),
    getHomeReviews(),
  ]);

  const hasCatalog =
    home.featured.length + home.newArrivals.length + home.bestSellers.length > 0;

  return (
    <>
      <Hero banners={home.heroBanners} />

      {home.promoStrip ? (
        <div className="bg-ink text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2.5 text-center text-sm">
            <Truck size={15} className="shrink-0 text-brand-300" />
            <span>{home.promoStrip.title}</span>
            {home.promoStrip.cta_href && home.promoStrip.cta_label ? (
              <Link
                href={home.promoStrip.cta_href}
                className="font-medium text-brand-300 underline-offset-2 hover:underline"
              >
                {home.promoStrip.cta_label}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {home.featuredCategories.length > 0 ? (
        <Section
          title="Shop by category"
          subtitle="Everything we stock, sorted the way you actually shop."
          href="/products"
        >
          <CategoryGrid categories={home.featuredCategories} />
        </Section>
      ) : null}

      {home.categoryTiles.length > 0 ? (
        <Section
          title="Featured collections"
          subtitle="Curated picks, refreshed as new stock lands."
        >
          <PromoTiles banners={home.categoryTiles} />
        </Section>
      ) : null}

      {home.flashSale && home.flashSale.items.length > 0 ? (
        <FlashSaleSection sale={home.flashSale} />
      ) : null}

      {!hasCatalog ? (
        <div className="mx-auto max-w-7xl px-4 py-12">
          <EmptyState
            title="The catalogue is still being loaded"
            description="Products will appear here as soon as they are published from the admin panel."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/products">Open admin</Link>
              </Button>
            }
          />
        </div>
      ) : null}

      {home.bestSellers.length > 0 ? (
        <Section
          title="Best sellers"
          subtitle="What Nazmul customers buy most."
          href="/products?sort=popular"
        >
          <ProductRail products={home.bestSellers} />
        </Section>
      ) : null}

      {home.featured.length > 0 ? (
        <Section title="Handpicked for you" href="/products?sort=newest">
          <ProductGrid products={home.featured} priorityCount={4} />
        </Section>
      ) : null}

      {home.offerCards.length > 0 ? (
        <Section title="Why shop with us">
          <OfferCards banners={home.offerCards} />
        </Section>
      ) : null}

      {home.newArrivals.length > 0 ? (
        <Section
          title="New arrivals"
          subtitle="Fresh stock, just published."
          href="/products?sort=newest"
        >
          <ProductRail products={home.newArrivals} />
        </Section>
      ) : null}

      {reviews.length > 0 ? (
        <Section
          title="What customers say"
          subtitle="Only from verified, delivered orders."
        >
          <ReviewWall reviews={reviews} />
        </Section>
      ) : null}

      <Section title="Buying from Nazmul">
        <WhyChooseUs />
      </Section>

      {/* Delivery + warranty + contact, the three things a BD shopper checks
          before committing to cash on delivery. */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-6">
            <Truck className="text-brand-600" size={22} />
            <h3 className="mt-3 text-base font-semibold text-ink">Delivery</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Inside Dhaka 1–2 days, suburbs 2–3 days, rest of Bangladesh 3–5 days.
              Free delivery kicks in automatically above each zone&apos;s threshold.
            </p>
            <Link
              href="/shipping"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Charges by district <ArrowRight size={14} />
            </Link>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6">
            <ShieldCheck className="text-success" size={22} />
            <h3 className="mt-3 text-base font-semibold text-ink">
              Warranty & replacement
            </h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {settings.warranty_note ||
                "Official warranty through the brand's Bangladesh service centre."}
            </p>
            <Link
              href="/warranty"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Read the policy <ArrowRight size={14} />
            </Link>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6">
            <MessageCircle className="text-warning" size={22} />
            <h3 className="mt-3 text-base font-semibold text-ink">Talk to us</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {settings.support_hours}. Call {settings.support_phone}, or message us on
              WhatsApp for the fastest reply.
            </p>
            <Link
              href="/contact"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              All contact options <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
