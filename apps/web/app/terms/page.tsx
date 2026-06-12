import { Header, SiteTopbar } from "@/components";

export default function Terms() {
  return (
    <>
      <SiteTopbar />
      <Header title="Terms" subtitle="Demo page (placeholder)" />
      <div className="card" style={{ lineHeight: 1.55, fontWeight: 800 }}>
        Terms of use will live here. This page is part of the production site skeleton (catalog, delivery,
        checkout, policy pages).
      </div>
    </>
  );
}
