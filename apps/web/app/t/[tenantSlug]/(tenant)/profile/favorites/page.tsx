import { getFavoritesAction } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import { FavoriteButton, AddToCartButton } from "@/components";
import { notFound } from "next/navigation";
import { listBranches, getBranchConfig } from "@/lib/data";

// This page is nested under layout that provides auth check?
// Assuming typical profile layout.


function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
    const val = record[key];
    return typeof val === "string" ? val : undefined;
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
    const val = record[key];
    return typeof val === "number" ? val : undefined;
}

export default async function FavoritesPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    // PHASE 9: Route Guard - Check if favorites feature is enabled
    const { tenantSlug } = await params;
    const branches = await listBranches();
    const firstBranch = branches[0];

    if (firstBranch) {
        const cfg = await getBranchConfig(firstBranch.slug, tenantSlug);
        // Check granular 'favorites' flag, fallback to 'profile' master
        const isFavoritesEnabled = cfg?.features?.modules?.favorites
            ?? cfg?.features?.modules?.profile
            ?? true;

        if (!isFavoritesEnabled) {
            notFound(); // 404 if favorites feature is disabled
        }
    }

    const data = await getFavoritesAction(tenantSlug).catch(() => null);
    const favorites = data?.favorites || [];

    return (
        <div style={{ padding: 20 }}>
            <h1 className="sectionTitle">Favorites</h1>
            <div className="sectionSub" style={{ marginBottom: 20 }}>
                Your saved items ({favorites.length})
            </div>

            {favorites.length === 0 ? (
                <div className="muted">You have not added anything to favorites yet.</div>
            ) : (
                <div className="grid3">
                    {favorites.map((fav) => {
                        if (!isRecord(fav)) return null;

                        const catalogItemId = getString(fav, "catalogItemId");
                        const rawItem = fav["catalogItem"];
                        const item = isRecord(rawItem) ? rawItem : {};

                        const id = getString(item, "id");
                        const title = getString(item, "title") || "Item";
                        const desc = getString(item, "desc");
                        const weightG = getNumber(item, "weightG");
                        const basePriceCents = getNumber(item, "basePriceCents") ?? 0;

                        const effectiveId = id ?? catalogItemId;
                        if (!effectiveId) return null;

                        return (
                            <div key={effectiveId} className="card product">
                                <div style={{ position: "relative" }}>
                                    <p className="productTitle">{title}</p>
                                    {desc ? <p className="productDesc">{desc}</p> : null}
                                    <div className="tagRow" style={{ marginTop: 8 }}>
                                        {weightG ? <span className="tag">{weightG} g</span> : null}
                                    </div>
                                    <div style={{ position: "absolute", top: -8, right: -8, zIndex: 10 }}>
                                        <FavoriteButton productId={effectiveId} initialIsFavorite={true} tenantSlug={tenantSlug} />
                                    </div>
                                </div>
                                <div className="priceRow" style={{ marginTop: "auto", paddingTop: 10 }}>
                                    <div>
                                        <span className="price">{formatPrice(basePriceCents, false)} UAH</span>
                                    </div>
                                    {id && <AddToCartButton id={id} title={title} price={basePriceCents} tenantSlug={tenantSlug} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
