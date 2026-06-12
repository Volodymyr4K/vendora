import { redirect } from "next/navigation";
import { FetchJsonError, getDefaultBranch, getTenantConfig } from "@/lib/data";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";
import { resolveMainTemplate } from "@/lib/main-templates/registry";

export default async function TenantMainPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const routingContext = await getRoutingContext();

  let defaultBranchSlug: string | undefined;
  try {
    const defaultBranch = await getDefaultBranch(tenantSlug);
    defaultBranchSlug = defaultBranch.slug;
  } catch (err) {
    if (err instanceof FetchJsonError && (err.status === 404 || err.status === 409)) {
      const returnTo = tenantHref(routingContext, "/main");
      redirect(`${tenantHref(routingContext, "/choose-city")}?returnTo=${encodeURIComponent(returnTo)}`);
    }
    throw err;
  }

  const config = await getTenantConfig(tenantSlug);
  const Template = await resolveMainTemplate(config.mainTemplate);
  return <Template tenantSlug={tenantSlug} branchSlug={defaultBranchSlug} amContent={config.amContent} />;
}
