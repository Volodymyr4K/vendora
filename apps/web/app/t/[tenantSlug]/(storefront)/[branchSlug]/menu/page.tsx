import { Header } from "@/components";
import { getBranchConfig, getMenu } from "@/lib/data";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { MenuClient } from "@/components/menu/MenuClient";
import { notFound } from "next/navigation";

export const revalidate = 60;

export default async function MenuPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) notFound();
  if (cfg.features?.modules?.menu === false) notFound();

  const locale = tenantSlug === "berlin-press"
    ? (await getAmLocaleForTenant(tenantSlug)).locale
    : undefined;
  const menu = await getMenu(branchSlug, tenantSlug, locale);

  return (
    <>
      <Header title={`Каталог • ${cfg.cityName}`} subtitle="Step 10: повний каталог + кошик" />
      <MenuClient branchSlug={cfg.slug} menu={menu} tenantSlug={tenantSlug} />
    </>
  );
}
