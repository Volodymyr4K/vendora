import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseRaw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://berlin-press.example";
  const base = baseRaw.endsWith("/") ? baseRaw.slice(0, -1) : baseRaw;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/*/order/*", "/api/*"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
