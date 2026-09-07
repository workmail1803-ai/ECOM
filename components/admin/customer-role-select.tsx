"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AppRole } from "@/types/database";
import { setUserRole } from "@/lib/actions/admin";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";

/**
 * Role assignment.
 *
 * `setUserRole` calls requireAdmin() and refuses self-edits — `canEdit` only
 * decides whether to render a control, it does not grant anything.
 */
export function CustomerRoleSelect({
  userId,
  role,
  canEdit,
}: {
  userId: string;
  role: AppRole;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!canEdit) {
    return (
      <Badge tone={role === "admin" ? "brand" : role === "manager" ? "warning" : "neutral"}>
        {role}
      </Badge>
    );
  }

  return (
    <Select
      value={role}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as AppRole;
        if (
          (next === "admin" || next === "manager") &&
          !window.confirm(`Grant ${next} access to this account?`)
        ) {
          return;
        }
        start(async () => {
          const result = await setUserRole(userId, next);
          if (!result.ok) {
            toast.error(result.error ?? "Could not change the role.");
            return;
          }
          toast.success(result.message ?? "Role updated.");
          router.refresh();
        });
      }}
      className="h-8 w-32 text-xs"
      aria-label="Change role"
    >
      <option value="customer">Customer</option>
      <option value="manager">Manager</option>
      <option value="admin">Admin</option>
    </Select>
  );
}
