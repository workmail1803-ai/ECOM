import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/account/reset-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Enter your email and we will send you a link to set a new one.
      </p>

      <ResetRequestForm />

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
