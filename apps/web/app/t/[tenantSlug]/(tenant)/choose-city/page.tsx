import { Header, SiteTopbar } from "@/components";
import { listBranches } from "@/lib/data";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref } from "@/lib/routing-helpers";

// Force dynamic rendering to ensure middleware headers are available
export const dynamic = "force-dynamic";

function sanitizeReturnTo(tenantSlug: string, raw?: string | null): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//")) return null;
  if (candidate.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(candidate, "https://example.invalid");
  } catch {
    return null;
  }

  const tenantPrefix = `/t/${tenantSlug}`;
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname.startsWith(`${tenantPrefix}/`)) return null;

  const mainPath = `${tenantPrefix}/main`;
  if (pathname === mainPath) return null;

  return `${pathname}${url.search}${url.hash}`;
}

export default async function ChooseCity({
  searchParams,
  params,
}: {
  searchParams?: { returnTo?: string };
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const branches = await listBranches();
  const routingContext = await getRoutingContext();
  const returnTo = sanitizeReturnTo(tenantSlug, searchParams?.returnTo);

  return (
    <>
      <SiteTopbar />
      <Header title="Choose a city/branch" subtitle="Representative demo catalog + a ready-to-use checkout." />
      <div className="grid3">
        {branches.map((b) => (
          <a
            key={b.slug}
            className="card link"
            href={returnTo ?? storefrontHref(routingContext, "/", { explicitBranchSlug: b.slug })}
            style={{ textDecoration: "none" }}
          >
            <div style={{ fontWeight: 950, fontSize: 18, letterSpacing: "-.3px" }}>{b.cityName}</div>
            <div className="muted" style={{ marginTop: 6, fontWeight: 800 }}>slug: {b.slug}</div>
            <div style={{ marginTop: 12 }}>
              <span className="btn">Open</span>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
