import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/account/reset-forms";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

/**
 * Reached from the emailed recovery link. Supabase puts the recovery token in
 * the URL fragment and the client SDK exchanges it for a session before this
 * form submits, so there is nothing to read from searchParams here.
 */
export default function ResetPasswordPage() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-ink">Set a new password</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Choose something you have not used elsewhere.
      </p>
      <UpdatePasswordForm />
    </div>
  );
}
