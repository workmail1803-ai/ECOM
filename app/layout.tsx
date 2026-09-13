import type { Metadata, Viewport } from "next";
import { Sora, Plus_Jakarta_Sans, Hind_Siliguri } from "next/font/google";
import { Toaster } from "sonner";
import { getStoreSettings } from "@/lib/queries/settings";
import "./globals.css";

/**
 * Three faces, each with a job.
 *
 * Sora is the display face — geometric, slightly technical, and it gives
 * headings and prices a character Inter deliberately does not have. Plus
 * Jakarta Sans carries body and UI: humanist enough to stay readable at 11px
 * in a spec table, warmer than Inter at large sizes.
 *
 * Hind Siliguri is the Bengali face, and it is not optional. The Latin faces
 * have no Bengali glyphs, so a promo tile written in Bangla would fall back to
 * whatever the device happens to have — often nothing, which renders as tofu
 * boxes. It is designed for Devanagari-family UI rather than adapted from a
 * print face, so it holds up next to Jakarta at small sizes.
 *
 * All three are self-hosted and subset by next/font, so this costs no
 * render-blocking request to Google and no layout shift.
 */
const display = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-latin",
  display: "swap",
});

const bengali = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bengali",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getStoreSettings();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    metadataBase: new URL(site),
    title: {
      default: `${s.store_name} — ${s.store_tagline}`,
      template: `%s · ${s.store_name}`,
    },
    description: s.store_description,
    openGraph: {
      type: "website",
      siteName: s.store_name,
      title: `${s.store_name} — ${s.store_tagline}`,
      description: s.store_description,
      locale: "en_BD",
    },
    twitter: { card: "summary_large_image" },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#1b4dff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${bengali.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{ style: { fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
