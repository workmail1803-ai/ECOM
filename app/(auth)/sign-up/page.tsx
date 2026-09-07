import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/account/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Faster checkout, order history and a wishlist that follows you.
      </p>

      <SignUpForm />

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
