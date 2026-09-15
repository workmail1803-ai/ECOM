"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin, LocateFixed, Loader2, X, Search } from "lucide-react";
import {
  reverseGeocode,
  searchPlaces,
  type PlaceSuggestion,
} from "@/lib/actions/geocode";
import { Button } from "@/components/ui/button";

/*
 * Leaflet ships its own stylesheet and does not work without it: `.leaflet-tile`
 * relies on it for `position: absolute`, and with no CSS the tiles fall back to
 * normal inline layout and scatter diagonally across the container instead of
 * forming a map. Imported here rather than globally so it only loads on pages
 * that actually render a map.
 */
import "leaflet/dist/leaflet.css";

export interface PickedLocation {
  lat: number;
  lng: number;
  label: string;
  area: string;
  street: string;
  city: string;
}

/** Dhaka, used only as the map's opening view before a pin exists. */
const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

/**
 * Bangladesh's bounding box, slightly generous at the edges.
 *
 * Used to reject a pin the shop cannot deliver to. A box is crude — it
 * includes slivers of neighbouring states — but it is honest about what it
 * does, needs no extra service, and the failure it prevents (a courier order
 * to another country) is the one that matters.
 */
const BD_BOUNDS = { minLat: 20.3, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 };

function inBangladesh(lat: number, lng: number): boolean {
  return (
    lat >= BD_BOUNDS.minLat &&
    lat <= BD_BOUNDS.maxLat &&
    lng >= BD_BOUNDS.minLng &&
    lng <= BD_BOUNDS.maxLng
  );
}

/**
 * "Use my location" — GPS, a draggable pin, and a written address.
 *
 * Leaflet with OpenStreetMap tiles rather than Google Maps: no API key, no
 * billing account, nothing to configure before this works. Leaflet is loaded
 * with a dynamic import inside an effect because it touches `window` at module
 * scope and would crash server rendering.
 *
 * The pin is a SUGGESTION engine, not an authority. Bangladeshi street-level
 * map data is patchy, GPS can be refused or twenty metres out, and a courier
 * still reads the written address at the door — so every field it fills stays
 * editable, and a customer who denies permission can drag the pin or just type.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (next: PickedLocation | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [resolving, startResolve] = useTransition();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [searching, startSearch] = useTransition();

  const runSearch = () => {
    const q = query.trim();
    if (q.length < 3) return;
    startSearch(async () => {
      const found = await searchPlaces(q);
      setResults(found);
      setStatus(
        found.length === 0
          ? "Nothing found for that. Try a nearby landmark, or drop the pin yourself."
          : null,
      );
    });
  };

  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);

  // Set the pin and ask what is there. Failure to geocode is not failure to
  // pick: the coordinates are kept either way.
  const place = (lat: number, lng: number) => {
    /*
     * A pin outside Bangladesh is not a delivery address, it is a bad fix — a
     * VPN, a desktop with no GPS, or a phone that located itself off a foreign
     * network. Accepting one silently selected "Outside Dhaka, tk 100", which
     * quietly promises to deliver somewhere we do not.
     */
    if (!inBangladesh(lat, lng)) {
      setStatus(
        "That location is outside Bangladesh, so we cannot deliver to it. " +
          "Search for your address above, or drag the pin to it.",
      );
      setOpen(true);
      return;
    }

    startResolve(async () => {
      const r = await reverseGeocode(lat, lng);
      onChange({
        lat,
        lng,
        label: r.label ?? "",
        area: r.area ?? "",
        street: r.street ?? "",
        city: r.city ?? "",
      });
      setStatus(
        r.ok
          ? null
          : "Pin saved, but we could not look up the address — please type it below.",
      );
    });
  };

  useEffect(() => {
    if (!open || !holderRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holderRef.current) return;

      // Leaflet's default marker images resolve to paths that do not exist in
      // a bundled app, so the pin is drawn instead of loaded.
      const icon = L.divIcon({
        className: "",
        html:
          '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;' +
          "background:#e11d48;border:3px solid #fff;transform:rotate(-45deg);" +
          'box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const start: [number, number] = value
        ? [value.lat, value.lng]
        : DEFAULT_CENTER;

      const map = L.map(holderRef.current).setView(start, value ? 16 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const marker = L.marker(start, { draggable: true, icon }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        place(p.lat, p.lng);
      });
      // Tapping the map is faster than dragging on a phone.
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        place(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;

      /*
       * Leaflet caches the container size when the map is created and only
       * loads tiles for THAT rectangle. The container here is sized by CSS
       * after creation, so a single delayed invalidateSize() raced the layout
       * and lost — which is why the map painted tiles in a narrow band and
       * left the rest blank.
       *
       * A ResizeObserver removes the race entirely: every time the element's
       * box actually changes, Leaflet is told, and it fills whatever size it
       * now has.
       */
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(holderRef.current);
      resizeRef.current = ro;

      // One immediate pass for the common case where the box is already final.
      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
      resizeRef.current?.disconnect();
      resizeRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the pin in step when the value changes from outside the map.
  useEffect(() => {
    if (!value || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([value.lat, value.lng]);
    mapRef.current.setView([value.lat, value.lng], 16);
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("This browser cannot share a location. Drop the pin instead.");
      setOpen(true);
      return;
    }

    setLocating(true);
    setStatus(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOpen(true);
        place(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setOpen(true);
        // Each failure gets its own sentence, because the thing to do next is
        // different in each case.
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Drop the pin on the map instead, or just type your address."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Your device could not get a GPS fix. Drop the pin on the map instead."
              : "Finding your location took too long. Drop the pin on the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-sunken/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={locate} loading={locating}>
          <LocateFixed size={15} />
          Use my location
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          <MapPin size={15} />
          {open ? "Hide map" : "Pick on map"}
        </Button>

        {resolving ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Loader2 size={13} className="animate-spin" />
            Looking up the address…
          </span>
        ) : null}
      </div>

      {/*
        Typing is a first-class way in, not a fallback. Geolocation can be
        refused or unavailable indoors, and plenty of orders go to an office or
        to somebody else's house — where the customer's own position is the
        wrong answer.
      */}
      <div className="mt-2 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Inside a checkout form, Enter would otherwise submit the order.
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="Type an address or landmark…"
          aria-label="Search for your address"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={searching}
          disabled={query.trim().length < 3}
          onClick={runSearch}
        >
          <Search size={14} />
          Search
        </Button>
      </div>

      {results && results.length > 0 ? (
        <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line bg-surface">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setResults(null);
                  setQuery("");
                  place(r.lat, r.lng);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-surface-sunken"
              >
                <MapPin size={13} className="mt-0.5 shrink-0 text-brand-600" />
                <span className="text-ink-soft">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {status ? (
        <p
          role="status"
          className="mt-2 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning"
        >
          {status}
        </p>
      ) : null}

      {open ? (
        <div
          ref={holderRef}
          className="mt-2.5 h-64 w-full overflow-hidden rounded-lg border border-line"
          // Leaflet paints into this element directly.
          aria-label="Map. Tap or drag the pin to set your delivery location."
        />
      ) : null}

      {value ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-success/20 bg-success-soft px-3 py-2">
          <MapPin size={14} className="mt-0.5 shrink-0 text-success" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-success">Location set</p>
            {value.label ? (
              <p className="mt-0.5 line-clamp-2 text-success/80">{value.label}</p>
            ) : null}
            <p className="mt-0.5 font-mono text-[11px] text-success/70">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setStatus(null);
            }}
            className="shrink-0 rounded p-0.5 text-success/70 hover:text-success"
            aria-label="Clear the location"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-4 text-ink-faint">
          Optional. It gives the courier an exact pin — you can still just type
          your address below.
        </p>
      )}
    </div>
  );
}
