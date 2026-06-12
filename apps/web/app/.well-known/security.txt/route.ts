export const dynamic = "force-static";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://berlin-press.example";
  const canonicalBase = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  const canonical = `${canonicalBase}/.well-known/security.txt`;
  const contact = process.env.SECURITY_CONTACT_EMAIL || "security@vendora.com";
  const body = [
    `Contact: mailto:${contact}`,
    "Expires: 2026-12-31T23:59:59Z",
    "Preferred-Languages: uk, en",
    `Canonical: ${canonical}`,
  ].join("\n") + "\n";
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
