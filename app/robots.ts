import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing here is secret — RLS handles that — but a crawler indexing a
      // checkout page or an admin route is pure waste.
      disallow: ["/admin", "/account", "/checkout", "/cart", "/api/", "/order/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
