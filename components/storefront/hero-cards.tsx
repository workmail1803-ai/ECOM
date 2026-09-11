import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Banner } from "@/types/database";

/**
 * The hero: two rows of campaign cards drifting continuously in opposite
 * directions — top row left, bottom row right.
 *
 * Each row renders its cards TWICE and the CSS translates the track by exactly
 * -50%, so the second copy arrives where the first began and the loop is
 * seamless. See the `.marquee` rules in globals.css for why the gap is padding
 * on each card rather than `gap` on the track.
 *
 * Both rows pause on hover and on keyboard focus, because a card nobody can
 * catch is a card nobody can click. `prefers-reduced-motion` turns the drift
 * off entirely and hands the row back as a normal scroller.
 *
 * Content comes from `banners` — artwork, Bangla headline, caption, link and
 * accent colour are all editable at /admin/banners with no deploy.
 */
export function HeroCards({
  banners,
  heading,
}: {
  banners: Banner[];
  heading: string;
}) {
  if (banners.length === 0) return null;

  const half = Math.ceil(banners.length / 2);
  const topRow = fill(banners.slice(0, half));
  const bottomRow = fill(banners.slice(half));

  return (
    <section className="bg-surface-sunken py-4 sm:py-5" aria-label="Featured collections">
      {/*
        The visible cards carry no page heading, matching the campaign look, so
        the document still needs one for search engines and screen readers.
      */}
      <h1 className="sr-only">{heading}</h1>

      <div className="space-y-2.5 sm:space-y-3">
        <MarqueeRow banners={topRow} priority />
        <MarqueeRow banners={bottomRow} reverse />
      </div>
    </section>
  );
}

/**
 * A row needs enough cards to overflow a wide viewport twice over, or the
 * -50% translate reveals empty track. Repeat the set until it is long enough.
 */
function fill(cards: Banner[], min = 5): Banner[] {
  if (cards.length === 0) return [];
  const out = [...cards];
  while (out.length < min) out.push(...cards);
  return out;
}

function MarqueeRow({
  banners,
  reverse = false,
  priority = false,
}: {
  banners: Banner[];
  reverse?: boolean;
  priority?: boolean;
}) {
  if (banners.length === 0) return null;

  // Longer rows must travel further to keep the apparent speed constant.
  const duration = `${banners.length * 9}s`;

  return (
    <div className="marquee">
      <div
        className={`marquee-track${reverse ? " marquee-track--reverse" : ""}`}
        style={{ ["--marquee-duration" as string]: duration }}
      >
        {/* Two identical copies: the first is the content, the second is the loop. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex" aria-hidden={copy === 1}>
            {banners.map((b, i) => (
              <CampaignCard
                key={`${copy}-${b.id}-${i}`}
                banner={b}
                priority={priority && copy === 0 && i < 3}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignCard({
  banner: b,
  priority = false,
}: {
  banner: Banner;
  priority?: boolean;
}) {
  const accent = b.accent_hex ?? "#1b4dff";

  return (
    // pe-* is the inter-card gap. It must live on the card, not on the track —
    // see the note in globals.css.
    <div className="shrink-0 pe-2.5 sm:pe-3">
      <Link
        href={b.cta_href ?? "/products"}
        className="
          group relative block h-[15rem] w-[11.5rem] overflow-hidden rounded-2xl
          bg-ink ring-1 ring-ink/5 transition-shadow duration-300 hover:shadow-pop
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600
          focus-visible:ring-offset-2
          sm:h-[18rem] sm:w-[14rem]
          lg:h-[21rem] lg:w-[16.5rem]
        "
      >
        {b.image_url ? (
          <Image
            src={b.image_url}
            alt=""
            fill
            sizes="(min-width: 1024px) 264px, (min-width: 640px) 224px, 184px"
            priority={priority}
            className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.06]"
          />
        ) : null}

        {/*
          Four passes, each doing one job:
            1. an accent wash that ties mismatched photographs into one set;
            2. a TOP scrim, because the Bangla headline is white and half these
               photographs are pale products on pale backgrounds — a drop shadow
               alone does not survive a white keyboard;
            3. a bottom scrim that earns the caption its contrast;
            4. a hairline inset so the card reads as an object rather than a
               hole punched in the page.
        */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(165deg, ${accent}73 0%, ${accent}26 40%, transparent 62%)`,
          }}
        />
        <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-ink/75 via-ink/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-ink via-ink/72 to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />

        {b.eyebrow ? (
          <p className="absolute inset-x-0 top-0 px-3 pt-3.5 text-center text-[13px] font-bold leading-[1.4] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] sm:pt-4 sm:text-[15px] lg:text-[17px]">
            {b.eyebrow}
          </p>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-3.5 lg:p-4">
          <h2 className="text-sm font-bold leading-tight tracking-tight text-white sm:text-base lg:text-lg">
            {b.title}
          </h2>

          {b.subtitle ? (
            <p className="mt-0.5 line-clamp-1 text-[10px] text-white/70 sm:text-[11px] lg:text-xs">
              {b.subtitle}
            </p>
          ) : null}

          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-ink sm:text-[11px]">
            {b.cta_label ?? "Discover"}
            <ArrowRight
              size={12}
              className="transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </Link>
    </div>
  );
}
