"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import type { Setting } from "@/types/database";
import { saveSettings, type AdminState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Card, Badge } from "@/components/ui/primitives";

const initial: AdminState = { ok: false };

/**
 * Settings are jsonb. Scalars (a string, a number) get a text input; objects
 * and arrays are shown read-only, because a free-text JSON box in an admin
 * panel is a reliable way to break a storefront at 2am.
 */
function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  );
}

export function SettingsForm({ settings }: { settings: Setting[] }) {
  const [state, action, pending] = useActionState(saveSettings, initial);

  const editable = settings.filter((s) => isScalar(s.value));
  const structured = settings.filter((s) => !isScalar(s.value));

  return (
    <>
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Store configuration</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          These drive the header, footer, meta tags and order emails.
        </p>

        <form action={action} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {editable.map((s) => (
              <Field
                key={s.key}
                label={s.key.replace(/_/g, " ")}
                htmlFor={`setting__${s.key}`}
                hint={s.description ?? undefined}
                className="capitalize"
              >
                <Input
                  id={`setting__${s.key}`}
                  name={`setting__${s.key}`}
                  defaultValue={String(s.value ?? "")}
                  className="normal-case"
                />
              </Field>
            ))}
          </div>

          {state.error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok && state.message ? (
            <p className="mt-3 text-sm font-medium text-success">{state.message}</p>
          ) : null}

          <Button type="submit" loading={pending} className="mt-4">
            Save settings
          </Button>
        </form>
      </Card>

      {structured.length > 0 ? (
        <Card className="mt-4 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Lock size={14} />
            Structured settings
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            These hold objects or lists. Edit them in the Supabase table editor —
            a malformed value here would break the storefront.
          </p>

          <ul className="mt-3 divide-y divide-line text-sm">
            {structured.map((s) => (
              <li key={s.key} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize text-ink">
                    {s.key.replace(/_/g, " ")}
                  </span>
                  {!s.is_public ? <Badge>private</Badge> : null}
                </div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
                  {JSON.stringify(s.value, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
