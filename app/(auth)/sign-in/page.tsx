import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/account/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Sign in to track orders, save addresses and keep a wishlist.
      </p>

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
