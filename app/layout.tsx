import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { getStoreSettings } from "@/lib/queries/settings";
import "./globals.css";

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
    <html lang="en">
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
