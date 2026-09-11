import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { Toaster } from "sonner";
import { getStoreSettings } from "@/lib/queries/settings";
import "./globals.css";

/**
 * Latin and Bengali are loaded as two families rather than one.
 *
 * Inter has no Bengali glyphs, so a promo tile written in Bangla would fall
 * back to whatever the device happens to have — often nothing, which renders
 * as tofu boxes. Listing Noto Sans Bengali after Inter in the same stack means
 * the browser reaches for it only for the codepoints Inter cannot draw.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

const bengali = Noto_Sans_Bengali({
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
    <html lang="en" className={`${inter.variable} ${bengali.variable}`}>
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
