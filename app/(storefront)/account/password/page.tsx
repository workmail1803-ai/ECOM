import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { UpdatePasswordForm } from "@/components/account/reset-forms";
import { PageHeader, Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Change password" };

export default async function PasswordPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Change password"
        description="You are already signed in, so no email confirmation is needed."
      />
      <Card className="max-w-md p-5">
        <UpdatePasswordForm />
      </Card>
    </>
  );
}
