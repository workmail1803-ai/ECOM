import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AddressManager } from "@/components/account/address-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { Address } from "@/types/database";

export const metadata: Metadata = { title: "Saved addresses" };
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Saved addresses"
        description="Pick one at checkout instead of typing it again."
      />
      <AddressManager addresses={(data as unknown as Address[]) ?? []} />
    </>
  );
}
