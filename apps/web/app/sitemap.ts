import type { MetadataRoute } from "next";
import { listBranches } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const now = new Date();

  let branches: Array<{ slug: string }> = [];
  try {
    branches = await listBranches();
  } catch {
    // fallback: do not break sitemap in case BFF is down
    branches = [];
  }

  const urls: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/choose-city`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/impressum`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  for (const b of branches) {
    urls.push({ url: `${base}/${b.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.8 });
    urls.push({ url: `${base}/${b.slug}/menu`, lastModified: now, changeFrequency: "daily", priority: 0.7 });
  }

  return urls;
}
