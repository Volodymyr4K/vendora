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
              <span className="pill"><span className="pillDot" />BFF + кеш + resiliency</span>
              <span className="pill"><span className="pillDot" />ISR-friendly каталог</span>
              <span className="pill"><span className="pillDot" />Checkout з idempotency</span>
            </div>

            <h1 className="heroTitle">Vendora vNext — демо готового продукту</h1>
            <div className="heroLead">
              Це "відчутна" збірка: фронт з каталогом та кошиком + BFF (backend-for-frontend) з кешем,
              стійкістю до помилок та підготовкою до інтеграції з реальним upstream.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <a className="btn" href="/choose-city">Почати • обрати місто</a>
              {branches[0] ? <a className="btn" href={`/${branches[0].slug}`}>Демо швидкий старт</a> : null}
            </div>
          </div>

          <div className="card heroCard">
            <div style={{ fontWeight: 950, letterSpacing: "-.3px", fontSize: 16 }}>Що всередині</div>
            <div className="muted" style={{ marginTop: 8, fontWeight: 800, lineHeight: 1.35 }}>
              • каталог з фільтрами та карточками<br />
              • кошик у LocalStorage + server quote<br />
              • створення замовлення + статус (token URL)<br />
              • готові ендпоінти BFF: /menu /delivery /checkout<br />
              • режими: mock або HTTP-upstream + discovery
            </div>

            <hr />

            <div style={{ fontWeight: 950, letterSpacing: "-.3px", fontSize: 16 }}>Доступні філії (demo)</div>
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
