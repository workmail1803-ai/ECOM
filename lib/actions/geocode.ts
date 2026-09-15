"use server";

export interface ResolvedPlace {
  ok: boolean;
  label?: string;
  /** Best guess at a thana / neighbourhood, for the Area field. */
  area?: string;
  /** House and road, as far as the geocoder knows it. */
  street?: string;
  /** City or district, used to pick the delivery zone. */
  city?: string;
  error?: string;
}

/**
 * Turn a pin into a written address.
 *
 * Nominatim (OpenStreetMap) rather than Google: no API key, no billing account
 * and no card on file, which matters for a shop running on free tiers. The
 * trade is accuracy — Bangladeshi street-level data is patchy — so everything
 * it returns is a SUGGESTION the customer can overwrite, never a value we
 * commit them to.
 *
 * Called from the server on purpose. Nominatim's usage policy requires an
 * identifying User-Agent, which a browser will not let us set, and going
 * through here keeps the customer's coordinates from being sent to a third
 * party by their own browser with their IP attached.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ResolvedPlace> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { ok: false, error: "That location is not valid." };
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: {
        // Required by Nominatim's policy; requests without it get blocked.
        "User-Agent": "nazmul-commerce/1.0 (storefront address lookup)",
        "Accept-Language": "en",
      },
      // A geocode is a nicety. Never let it hold up checkout.
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return { ok: false, error: "Could not look up that location." };
    }

    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = data.address ?? {};

    // Nominatim's fields vary by country and by how well mapped the spot is,
    // so each of these is a fallback chain rather than one key.
    const area =
      a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.town ?? "";
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city =
      a.city ?? a.town ?? a.state_district ?? a.county ?? a.state ?? "";

    return {
      ok: true,
      label: data.display_name ?? "",
      area,
      street,
      city,
    };
  } catch {
    // Timeout, network failure, or Nominatim rate-limiting us. The pin is
    // still good; the customer types the address themselves.
    return { ok: false, error: "Could not look up that location." };
  }
}

export interface PlaceSuggestion {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Find a place by name, so a customer can type instead of using GPS.
 *
 * Needed as a first-class path, not a fallback: geolocation can be refused,
 * unavailable indoors, or simply not what the customer wants — they may be
 * ordering to an office or to someone else's house. Typing "Dhanmondi 27"
 * should get a pin without arguing with a map.
 *
 * Restricted to Bangladesh, because every result outside it is noise for this
 * shop and a wrong pick sends a courier somewhere absurd.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  // Two characters matches half the country; not worth a request.
  if (q.length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "bd");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "nazmul-commerce/1.0 (storefront address lookup)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const rows = (await res.json()) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    }[];

    return rows
      .map((r) => ({
        label: r.display_name ?? "",
        lat: Number(r.lat),
        lng: Number(r.lon),
      }))
      .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}
