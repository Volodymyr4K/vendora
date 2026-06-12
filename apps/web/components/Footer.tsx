import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";

export async function Footer() {
  const routingContext = await getRoutingContext();
  return (
    <footer className="footer">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <b>Vendora</b> • demo build
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="link" href="/privacy">Privacy</a>
          <a className="link" href="/terms">Terms</a>
          <a className="link" href={tenantHref(routingContext, "/choose-city")}>City</a>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        A demo product for prototyping IA/UX, the BFF layer, and upstream integration.
      </div>
    </footer>
  );
}
