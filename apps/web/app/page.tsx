import { SiteTopbar } from "@/components";
import { listBranches } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const branches = await listBranches();
  return (
    <>
      <SiteTopbar />

      <section className="hero">
        <div className="heroGrid">
          <div className="card heroCard">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="pill"><span className="pillDot" />BFF + cache + resiliency</span>
              <span className="pill"><span className="pillDot" />ISR-friendly catalog</span>
              <span className="pill"><span className="pillDot" />Checkout with idempotency</span>
            </div>

            <h1 className="heroTitle">Vendora — multi-tenant storefront platform</h1>
            <div className="heroLead">
              A tangible build: a storefront with catalog and cart + a BFF (backend-for-frontend) with caching,
              failure resilience, and integration hooks for a real upstream.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <a className="btn" href="/choose-city">Get started • choose a city</a>
              {branches[0] ? <a className="btn" href={`/${branches[0].slug}`}>Quick demo start</a> : null}
            </div>
          </div>

          <div className="card heroCard">
            <div style={{ fontWeight: 950, letterSpacing: "-.3px", fontSize: 16 }}>What's inside</div>
            <div className="muted" style={{ marginTop: 8, fontWeight: 800, lineHeight: 1.35 }}>
              • catalog with filters and product cards<br />
              • cart in LocalStorage + server-side quote<br />
              • order creation + status (token URL)<br />
              • ready BFF endpoints: /menu /delivery /checkout<br />
              • modes: mock or HTTP upstream + discovery
            </div>

            <hr />

            <div style={{ fontWeight: 950, letterSpacing: "-.3px", fontSize: 16 }}>Available branches (demo)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              {branches.map((b) => (
                <a key={b.slug} className="btn" href={`/${b.slug}`}>{b.cityName} • {b.slug}</a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
