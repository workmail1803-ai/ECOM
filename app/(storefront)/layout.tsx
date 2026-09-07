import { Header } from "@/components/storefront/header";
import { Footer } from "@/components/storefront/footer";
import { SupportWidget } from "@/components/storefront/support-widget";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
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
