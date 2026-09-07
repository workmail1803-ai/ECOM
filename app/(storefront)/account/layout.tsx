import { requireUser } from "@/lib/auth/session";
import { AccountNav } from "@/components/account/account-nav";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already redirects signed-out visitors, but this is the check
  // that actually holds — middleware is UX, not authorization.
  const user = await requireUser("/account");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <AccountNav
          name={user.profile?.full_name ?? "Your account"}
          email={user.email ?? ""}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
