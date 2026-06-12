import { Header, CartLink } from "@/components";
import { getBranchConfig } from "@/lib/data";
import { SmartCheckout } from "@/components/checkout/SmartCheckout";
import { notFound } from "next/navigation";
import { getCustomerAddressesAction } from "@/app/customer-actions";

export default async function CheckoutPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) notFound();

  // ROUTE PROTECTION: Check if ordering module is enabled
  // ✅ DEFENSIVE DEFAULT: Block ONLY if explicitly disabled
  const isOrderingEnabled = cfg?.features?.modules?.ordering ?? true;
  if (!isOrderingEnabled) {
    notFound(); // 404 if ordering module is disabled
  }

  // PHASE 9: Granular Check - Time Slots (scheduledOrdering)
  // Falls back to master 'ordering' flag if granular flag is undefined
  const showTimeSlots = cfg?.features?.modules?.scheduledOrdering
    ?? cfg?.features?.modules?.ordering
    ?? true;

  // Fetch Addresses (Server Side)
  // Infer type from action
  type Address = Awaited<ReturnType<typeof getCustomerAddressesAction>>[number];
  let addresses: Address[] = [];
  let isAuthenticated = false;
  try {
    addresses = await getCustomerAddressesAction(tenantSlug);
    isAuthenticated = true;
  } catch (e) {
    // User not authenticated or error
    addresses = [];
  }

  return (
    <>
      <Header title={`Checkout • ${cfg.cityName}`} subtitle={`Branch: ${cfg.slug}`} right={<CartLink branchSlug={cfg.slug} />} />
      <div className="container mx-auto max-w-lg p-3">
        <SmartCheckout
          branchSlug={cfg.slug}
          tenantSlug={tenantSlug}
          cityName={cfg.cityName}
          phones={cfg.phones || []}
          initialAddresses={addresses}
          isAuthenticated={isAuthenticated}
          showTimeSlots={showTimeSlots}
        />
      </div>
    </>
  );
}
