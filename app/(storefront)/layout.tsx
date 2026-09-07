import { Suspense } from "react";
import { Header } from "@/components/storefront/header";
import { Footer } from "@/components/storefront/footer";
import { SupportWidget } from "@/components/storefront/support-widget";
import { NavProgress } from "@/components/ui/nav-progress";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Navigation progress bar — fires instantly on every internal link click */}
      <Suspense>
        <NavProgress />
      </Suspense>

      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <SupportWidget
        phone={process.env.NEXT_PUBLIC_SUPPORT_PHONE}
        whatsapp={process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP}
        messenger={process.env.NEXT_PUBLIC_SUPPORT_MESSENGER}
        email={process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
      />
    </div>
  );
}
