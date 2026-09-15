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
