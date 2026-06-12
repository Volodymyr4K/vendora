import { Header } from "@/components";
import { getBranchConfig } from "@/lib/data";
import { OrderStatusClient } from "@/components/checkout/OrderStatusClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Статус замовлення",
    robots: { index: false, follow: false },
  };
}

export default async function OrderStatusPage({ params }: { params: Promise<{ branchSlug: string; tenantSlug: string; token: string }> }) {
  const { branchSlug, tenantSlug, token } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) notFound();
  return (
    <>
      <Header title={`Замовлення • ${cfg.cityName}`} subtitle={`Філія: ${cfg.slug}`} />
      <OrderStatusClient branchSlug={cfg.slug} token={token} phones={cfg.phones || []} tenantSlug={tenantSlug} />
    </>
  );
}
