"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, ShieldCheck, Search, Check } from "lucide-react";
import {
  ADMIN_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_HINTS,
  type AdminPermission,
  type GrantablePermission,
} from "@/lib/auth/permissions";
import { setStaffAccess, findAccountByEmail } from "@/lib/actions/admin";
import type { StaffMember } from "@/lib/queries/admin";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";

type Role = "customer" | "manager" | "admin";

/**
 * Staff list plus the add-by-email flow.
 *
 * Adding staff is a two-step lookup rather than a free-text invite: the account
 * has to exist first. That keeps this page from having to create users, which
 * would mean handling passwords — something the admin panel should never do.
 */
export function StaffManager({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  return (
    <>
      {adding ? (
        <AddStaffForm
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button onClick={() => setAdding(true)} className="mb-4">
          <UserPlus />
          Add a staff member
        </Button>
      )}

      {staff.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={30} />}
          title="No staff yet"
          description="Add someone by email once they have created an account."
        />
      ) : (
        <div className="mt-4 space-y-3">
          {staff.map((member) => (
            <StaffRow
              key={member.id}
              member={member}
              isSelf={member.id === currentUserId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function StaffRow({ member, isSelf }: { member: StaffMember; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(member.role as Role);
  const [perms, setPerms] = useState<string[]>(member.permissions);
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle(key: GrantablePermission) {
    setPerms((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));
  }

  function save() {
    start(async () => {
      const result = await setStaffAccess(member.id, role, perms);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update that account.");
        return;
      }
      toast.success(result.message ?? "Access updated.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">
              {member.full_name ?? member.email ?? "Unnamed account"}
            </p>
            <Badge tone={member.role === "admin" ? "brand" : "warning"}>
              {member.role}
            </Badge>
            {isSelf ? <Badge>You</Badge> : null}
          </div>
          <p className="text-sm text-ink-muted">{member.email}</p>

          {member.role === "admin" ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              Unrestricted — every section, including staff and settings.
            </p>
          ) : member.permissions.length === 0 ? (
            <p className="mt-1.5 text-xs text-danger">
              No sections granted — they can sign in but will only see the dashboard.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1">
              {member.permissions.map((p) => (
                <Badge key={p}>
                  {PERMISSION_LABELS[p as AdminPermission] ?? p}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {!isSelf ? (
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Change access"}
          </Button>
        ) : (
          <p className="max-w-48 text-right text-[11px] text-ink-muted">
            You cannot change your own access — ask another admin.
          </p>
        )}
      </div>

      {editing && !isSelf ? (
        <div className="mt-4 border-t border-line pt-4">
          <Field label="Role" htmlFor={`role-${member.id}`} className="max-w-xs">
            <Select
              id={`role-${member.id}`}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="customer">Customer — remove admin access</option>
              <option value="manager">Manager — only the sections below</option>
              <option value="admin">Admin — unrestricted</option>
            </Select>
          </Field>

          {role === "manager" ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink-soft">
                Sections this manager can open
              </legend>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                {ADMIN_PERMISSIONS.map((key) => {
                  const on = perms.includes(key);
                  return (
                    <label
                      key={key}
                      title={PERMISSION_HINTS[key]}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                        on
                          ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                          : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(key)}
                        className="size-4 accent-brand-600"
                      />
                      {PERMISSION_LABELS[key]}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Settings and Staff are never grantable to a manager — only a full
                admin can change store configuration or other people&apos;s access.
              </p>
            </fieldset>
          ) : role === "admin" ? (
            <p className="mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">
              An admin can do everything you can, including changing your access and
              reading purchase costs. Grant this deliberately.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              This removes all admin access. Their orders and account stay intact.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button size="sm" loading={pending} onClick={save}>
              Save access
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRole(member.role as Role);
                setPerms(member.permissions);
                setEditing(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function AddStaffForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<{
    id: string;
    email: string | null;
    full_name: string | null;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [role, setRole] = useState<Role>("manager");
  const [perms, setPerms] = useState<string[]>(["orders", "products", "stock"]);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  function search() {
    if (!email.trim()) return;
    startSearch(async () => {
      const account = await findAccountByEmail(email);
      setFound(account);
      setNotFound(!account);
    });
  }

  function grant() {
    if (!found) return;
    startSave(async () => {
      const result = await setStaffAccess(found.id, role, perms);
      if (!result.ok) {
        toast.error(result.error ?? "Could not grant access.");
        return;
      }
      toast.success(`${found.email} is now ${role}.`);
      onDone();
    });
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-ink">Add a staff member</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        They need an account first. Ask them to sign up, then find them by email.
      </p>

      <div className="mt-4 flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFound(null);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="their@email.com"
          aria-label="Email address"
        />
        <Button variant="outline" onClick={search} loading={searching} disabled={!email.trim()}>
          {!searching ? <Search size={15} /> : null}
          Find
        </Button>
      </div>

      {notFound ? (
        <p className="mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning">
          No account with that email. Ask them to sign up at the storefront first,
          then search again.
        </p>
      ) : null}

      {found ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Check size={15} />
            Found {found.full_name ?? found.email}
          </p>

          <Field label="Role" htmlFor="new-staff-role" className="mt-3 max-w-xs">
            <Select
              id="new-staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="manager">Manager — only the sections below</option>
              <option value="admin">Admin — unrestricted</option>
            </Select>
          </Field>

          {role === "manager" ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink-soft">
                Sections they can open
              </legend>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                {ADMIN_PERMISSIONS.map((key) => {
                  const on = perms.includes(key);
                  return (
                    <label
                      key={key}
                      title={PERMISSION_HINTS[key]}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                        on
                          ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                          : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPerms((p) =>
                            p.includes(key) ? p.filter((x) => x !== key) : [...p, key],
                          )
                        }
                        className="size-4 accent-brand-600"
                      />
                      {PERMISSION_LABELS[key]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p className="mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-xs text-warning">
              An admin can do everything, including managing other staff and reading
              purchase costs.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button loading={saving} onClick={grant}>
              Grant access
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
