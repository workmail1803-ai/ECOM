"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Pencil, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { quickSaveBrand } from "@/lib/actions/admin";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type BrandOption = { id: string; name: string };

// A FIXED collation, not the runtime default. The initial sort runs on the
// server (en-US) and again in the browser during hydration; a browser set to
// Bangla sorts Bangla-script names first, the option lists differ, and React
// throws a hydration mismatch.
const collator = new Intl.Collator("en", { sensitivity: "base" });
const byName = (a: BrandOption, b: BrandOption) => collator.compare(a.name, b.name);

/**
 * The product form's Brand field.
 *
 * A plain list of existing brands read as "hardcoded" to the people filling
 * it in — a new maker meant abandoning the half-written product. Here the
 * list can grow and be corrected in place: "New brand" adds one and selects
 * it, "Rename" fixes the spelling of the selected one. Logos, hiding and
 * deleting stay on the Brands page, linked below.
 *
 * This sits INSIDE the product <form>, which cannot contain another form, so
 * the add/rename box is plain inputs and buttons calling a server action.
 * Its text box has no `name`, so it is never posted with the product, and
 * Enter is caught so it adds the brand instead of saving the product.
 */
export function BrandPicker({
  brands,
  defaultValue = "",
}: {
  brands: BrandOption[];
  defaultValue?: string;
}) {
  const [list, setList] = useState<BrandOption[]>(() => [...brands].sort(byName));
  const [selected, setSelected] = useState(defaultValue);
  const [mode, setMode] = useState<"pick" | "add" | "rename">("pick");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const current = list.find((b) => b.id === selected) ?? null;
  const unfinished =
    mode !== "pick" &&
    draft.trim() !== "" &&
    !(mode === "rename" && draft.trim() === current?.name);

  // A name typed but never added used to vanish: saving the product posted
  // the OLD brand and threw the typed one away without a word. While the box
  // holds an unfinished name, the browser's own validation stops the product
  // save and points at this box.
  //
  // The box also stays invalid WHILE a save is in flight: clicking "Create
  // product" in that moment would otherwise post the old brand and leave
  // before the new one arrived.
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      saving
        ? "Wait a moment — the brand is still being saved."
        : unfinished
          ? mode === "add"
            ? "Press Add to create this brand, or cancel it, before saving the product."
            : "Press Save to rename the brand, or cancel it, before saving the product."
          : "",
    );
  }, [saving, unfinished, mode]);

  const open = (next: "add" | "rename") => {
    setMode(next);
    setDraft(next === "rename" ? (current?.name ?? "") : "");
    setError(null);
    // After the input renders.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const close = () => {
    setMode("pick");
    setDraft("");
    setError(null);
    // The box (and the focused input) is about to unmount; without this,
    // keyboard focus falls back to <body> and the user loses their place.
    requestAnimationFrame(() => selectRef.current?.focus());
  };

  const submit = () => {
    // Enter pressed again while the first request is in flight.
    if (saving) return;

    const name = draft.trim();
    if (!name) {
      setError("Type the brand name.");
      return;
    }
    if (mode === "rename" && current && name === current.name) {
      close();
      return;
    }

    const renaming = mode === "rename" && current !== null;

    startSaving(async () => {
      let r: Awaited<ReturnType<typeof quickSaveBrand>>;
      try {
        r = await quickSaveBrand(renaming ? { id: current!.id, name } : { name });
      } catch {
        // A dropped connection or a deploy mid-session makes the call itself
        // throw. Uncaught, that reached the root error page and discarded the
        // half-filled product this picker exists to protect.
        setError("Could not reach the server. Check the connection and try again.");
        return;
      }

      if (!r.ok) {
        setError(r.error);
        return;
      }

      const saved = r.brand;
      setList((prev) =>
        [...prev.filter((b) => b.id !== saved.id), { id: saved.id, name: saved.name }].sort(
          byName,
        ),
      );
      setSelected(saved.id);
      close();

      if (renaming) toast.success(`Renamed to “${saved.name}”.`);
      else if (r.existed) toast.info(`“${saved.name}” already exists — selected it.`);
      else toast.success(`Brand “${saved.name}” added and selected.`);
    });
  };

  return (
    <div>
      <Select
        ref={selectRef}
        id="brand_id"
        name="brand_id"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={mode !== "pick"}
      >
        <option value="">No brand</option>
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>

      {/* A disabled <select> is not posted. While the add/rename box is open,
          keep the current choice in the form so the brand is never cleared
          by accident. */}
      {mode !== "pick" ? <input type="hidden" name="brand_id" value={selected} /> : null}

      {mode === "pick" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <button
            type="button"
            onClick={() => open("add")}
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus size={13} />
            New brand
          </button>
          {current ? (
            <button
              type="button"
              onClick={() => open("rename")}
              className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink"
            >
              <Pencil size={12} />
              Rename {current.name}
            </button>
          ) : null}
          <a
            href="/admin/brands"
            target="_blank"
            rel="noopener"
            className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-ink"
            title="Logos, hiding and deleting — opens in a new tab so this product is not lost"
          >
            Manage brands
            <ExternalLink size={12} />
          </a>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-line bg-surface-sunken p-2.5">
          <label htmlFor="brand-quick-name" className="text-xs font-medium text-ink">
            {mode === "add" ? "New brand name" : `Rename “${current?.name ?? ""}” to`}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              ref={inputRef}
              id="brand-quick-name"
              value={draft}
              maxLength={80}
              autoComplete="off"
              // Not readOnly while saving: a readonly field is skipped by form
              // validation, which would switch off the guard above exactly
              // when it is needed. Edits are ignored instead.
              aria-busy={saving || undefined}
              onChange={(e) => {
                if (saving) return;
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Inside the product form Enter would otherwise save the
                  // product instead of adding the brand.
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  // Closing mid-save would look like a cancel while the add
                  // still lands and switches the brand anyway.
                  if (!saving) close();
                }
              }}
              placeholder="e.g. Walton"
              aria-invalid={error ? true : undefined}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
            <Button type="button" size="sm" onClick={submit} loading={saving}>
              <Check size={14} />
              {mode === "add" ? "Add" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={close}
              disabled={saving}
              aria-label="Cancel"
            >
              <X size={14} />
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {error}
            </p>
          ) : mode === "rename" ? (
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Changes the name on every product of this brand.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
