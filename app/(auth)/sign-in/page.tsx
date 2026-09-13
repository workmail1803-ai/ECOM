import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/account/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Sign in to track orders, save addresses and keep a wishlist.
      </p>

      {/*
        /auth/callback sends failures here rather than dead-ending on a page
        with no explanation — an expired or already-used reset link is the
        common case.
      */}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          {error === "missing_code" || error === "invalid_code"
            ? "That link has expired or has already been used. Request a new one below."
            : decodeURIComponent(error)}
        </p>
      ) : null}

      <SignInForm next={next ?? ""} />

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link
          href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
