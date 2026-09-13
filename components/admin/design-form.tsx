"use client";

import { useActionState, useState } from "react";
import { RotateCcw } from "lucide-react";
import { saveSiteTheme, resetSiteTheme, type AdminState } from "@/lib/actions/admin";
import {
  COLOR_FIELDS,
  FONT_CHOICES,
  DEFAULT_THEME,
  type SiteTheme,
} from "@/lib/theme/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

const initial: AdminState = { ok: false };

/**
 * Design controls with a live preview.
 *
 * The preview is driven by local state rather than by saving and reloading,
 * because picking a brand colour is a dozen small adjustments and nobody wants
 * a round trip per nudge. Nothing is persisted until Save, and the server
 * re-validates everything regardless of what this form sends.
 */
export function DesignForm({ theme }: { theme: SiteTheme }) {
  const [state, action, pending] = useActionState(saveSiteTheme, initial);
  const [draft, setDraft] = useState<SiteTheme>(theme);
  const [resetting, setResetting] = useState(false);

  const setColor = (key: string, value: string) =>
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Colours</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            These drive every button, badge and panel on the storefront.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <label key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  name={`color__${key}`}
                  value={draft.colors[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                  aria-label={label}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-[11px] text-ink-faint">{hint}</span>
                  <span className="block font-mono text-[11px] uppercase text-ink-muted">
                    {draft.colors[key]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Typeface</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            A fixed list, because these are compiled in and self-hosted — a font
            named at runtime would cost a blocking request and flash on load.
            Bangla always uses Hind Siliguri.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Headings
              </span>
              <select
                name="headingFont"
                value={draft.headingFont}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, headingFont: e.target.value as never }))
                }
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Body &amp; interface
              </span>
              <select
                name="bodyFont"
                value={draft.bodyFont}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, bodyFont: e.target.value as never }))
                }
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-ink-muted">
              <span>Corner rounding</span>
              <span className="tabular">{draft.radius.toFixed(2)}rem</span>
            </span>
            <input
              type="range"
              name="radius"
              min={0}
              max={2}
              step={0.05}
              value={draft.radius}
              onChange={(e) =>
                setDraft((d) => ({ ...d, radius: Number(e.target.value) }))
              }
              className="w-full accent-brand-600"
            />
          </label>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>
            Save design
          </Button>

          <Button
            type="button"
            variant="outline"
            loading={resetting}
            onClick={async () => {
              setResetting(true);
              await resetSiteTheme();
              setDraft(DEFAULT_THEME);
              setResetting(false);
            }}
          >
            <RotateCcw size={15} />
            Reset to default
          </Button>

          {state.error ? (
            <span role="alert" className="text-sm text-danger">
              {state.error}
            </span>
          ) : state.ok && state.message ? (
            <span className="text-sm text-success">{state.message}</span>
          ) : null}
        </div>
      </div>

      <ThemePreview theme={draft} />
    </form>
  );
}

/**
 * A miniature storefront, scoped to its own CSS variables.
 *
 * The overrides are set on this element rather than on :root, so the preview
 * can show unsaved colours without recolouring the admin panel around it.
 */
function ThemePreview({ theme }: { theme: SiteTheme }) {
  const c = theme.colors;

  return (
    <div className="lg:sticky lg:top-4 lg:self-start">
      <p className="mb-2 text-xs font-medium text-ink-muted">Live preview</p>

      <div
        className="overflow-hidden rounded-xl border border-line"
        style={
          {
            "--color-brand-600": c.brand600,
            "--color-brand-700": c.brand700,
            "--color-ink": c.ink,
            "--color-surface": c.surface,
            "--color-surface-sunken": c.surfaceSunken,
            "--color-danger": c.danger,
            "--color-success": c.success,
            "--color-warning": c.warning,
            "--radius-card": `${theme.radius}rem`,
            background: c.surfaceSunken,
            color: c.ink,
          } as React.CSSProperties
        }
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: c.surface, borderBottom: `1px solid ${c.surfaceSunken}` }}
        >
          <span className="text-sm font-bold">Nazmul</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ background: c.danger }}
          >
            SALE
          </span>
        </div>

        <div className="space-y-3 p-4">
          <div
            className="p-3"
            style={{ background: c.surface, borderRadius: `${theme.radius}rem` }}
          >
            <div
              className="mb-2 h-16 w-full"
              style={{
                background: `linear-gradient(135deg, ${c.brand600}, ${c.brand700})`,
                borderRadius: `${theme.radius}rem`,
              }}
            />
            <p className="text-sm font-semibold">Wireless Earbuds</p>
            <p className="text-xs" style={{ opacity: 0.6 }}>
              In stock · Free delivery
            </p>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-base font-bold tabular">৳2,450</span>
              <span
                className="text-xs line-through tabular"
                style={{ opacity: 0.45 }}
              >
                ৳3,200
              </span>
            </div>

            <button
              type="button"
              className="mt-3 w-full px-3 py-2 text-xs font-semibold text-white"
              style={{ background: c.brand600, borderRadius: `${theme.radius}rem` }}
            >
              Add to cart
            </button>
          </div>

          <div className="flex gap-2">
            <span
              className="flex-1 px-2 py-1.5 text-center text-[11px] font-semibold text-white"
              style={{ background: c.success, borderRadius: `${theme.radius}rem` }}
            >
              Delivered
            </span>
            <span
              className="flex-1 px-2 py-1.5 text-center text-[11px] font-semibold text-white"
              style={{ background: c.warning, borderRadius: `${theme.radius}rem` }}
            >
              Pending
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-ink-faint">
        Fonts are not previewed here — they apply to the whole document, so the
        change shows on the storefront the moment you save.
      </p>
    </div>
  );
}
