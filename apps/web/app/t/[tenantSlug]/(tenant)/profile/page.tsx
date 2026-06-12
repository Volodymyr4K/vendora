import { getCustomerProfileAction, getCustomerAddressesAction, getCustomerOrdersAction } from "@/app/customer-actions";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { AddressBook } from "@/components/profile/AddressBook";
import { OrderHistory } from "@/components/profile/OrderHistory";
import { notFound } from "next/navigation";
import { listBranches } from "@/lib/data";
import { getBranchConfig } from "@/lib/data";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref, tenantHref } from "@/lib/routing-helpers";

export default async function ProfilePage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const { tenantSlug } = await params;
    const routingContext = await getRoutingContext();

    // ROUTE PROTECTION: Check if profile module is enabled for this tenant
    // Get first branch to access tenant features (features are tenant-level, not branch-level)
    const branches = await listBranches();
    const firstBranch = branches[0];

    if (firstBranch) {
        const cfg = await getBranchConfig(firstBranch.slug, tenantSlug);
        // ✅ DEFENSIVE DEFAULT: Block ONLY if explicitly disabled
        const isProfileEnabled = cfg?.features?.modules?.profile ?? true;
        if (!isProfileEnabled) {
            notFound(); // 404 if profile module is disabled
        }
    }

    const profile = await getCustomerProfileAction(tenantSlug);

    if (!profile) {
        const loginHref = `${tenantHref(routingContext, "/login")}?redirect=/profile`;
        return (
            <div className="min-h-screen bg-gradient-to-br from-accent-weak via-bg to-accent-weak flex items-center justify-center px-4 py-12">
                <div className="text-center p-10 bg-paper backdrop-blur-sm rounded-theme shadow-2xl border border-line max-w-md w-full transform hover:scale-[1.02] transition-all duration-300">
                    <div className="w-20 h-20 bg-gradient-to-br from-accent to-accent rounded-full flex items-center justify-center mx-auto mb-6 shadow-theme">
                        <svg className="w-10 h-10 text-accent-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent">Вітаємо!</h1>
                    <p className="text-muted mb-8 leading-relaxed">Увійдіть в систему, щоб переглянути замовлення та керувати профілем</p>
                    <div className="space-y-3">
                        <a
                            href={loginHref}
                            className="block w-full py-4 px-6 bg-gradient-to-r from-accent to-accent text-accent-foreground rounded-theme font-bold hover:shadow-xl hover:scale-[1.02] transition-all duration-300 transform"
                        >
                            Увійти
                        </a>
                        <a href={storefrontHref(routingContext, "/")} className="block text-sm text-muted hover:text-accent transition-colors">
                            ← Повернутись на головну
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    const [addresses, ordersPromise] = await Promise.all([
        getCustomerAddressesAction(tenantSlug).catch(() => []),
        getCustomerOrdersAction(tenantSlug).catch(() => ({ orders: [] }))
    ]);

    const orders = ordersPromise.orders || [];

    return (
        <div className="min-h-screen bg-gradient-to-br from-[var(--bg)] via-bg to-bg">
            {/* Sticky Navigation Bar */}
            <div className="sticky top-0 z-50 bg-paper backdrop-blur-md border-b border-line shadow-theme">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent">
                            Мій Кабінет
                        </h1>
                        <div className="flex items-center gap-2 flex-wrap sm:gap-3">
                            <a
                                href={storefrontHref(routingContext, "/")}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--line)] hover:bg-[var(--muted)] rounded-theme transition-colors text-sm font-semibold text-ink"
                            >
                                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                Головна
                            </a>
                            {profile.lastVisitedBranchSlug ? (
                                <a
                                    href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: profile.lastVisitedBranchSlug })}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-accent hover:opacity-90 text-accent-foreground rounded-theme transition-all text-sm font-semibold shadow-theme hover:shadow-lg"
                                >
                                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    Каталог
                                </a>
                            ) : (
                                <a
                                    href={tenantHref(routingContext, "/choose-city")}
                                    className="flex items-center gap-2 px-4 py-2 bg-accent-weak hover:opacity-80 rounded-theme transition-colors text-sm font-semibold text-accent"
                                >
                                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    Переглянути каталог
                                </a>
                            )}
                            <a
                                href={tenantHref(routingContext, "/choose-city")}
                                className="flex items-center gap-2 px-4 py-2 bg-accent-weak hover:opacity-80 rounded-theme transition-colors text-sm font-semibold text-accent"
                            >
                                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Вибрати філію
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent mb-3">
                        Мій Кабінет
                    </h1>
                    <p className="text-muted text-lg">Керуйте профілем, адресами та замовленнями</p>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Favorites */}
                        <section className="bg-paper rounded-theme shadow-theme hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-line">
                            <div className="bg-gradient-to-r from-accent to-accent p-6">
                                <h2 className="text-xl font-bold text-accent-foreground flex items-center gap-3">
                                    <span className="text-2xl">❤️</span>
                                    Улюблене
                                </h2>
                            </div>
                            <div className="p-6">
                                <a
                                    href={tenantHref(routingContext, "/profile/favorites")}
                                    className="block w-full py-3 px-4 bg-accent-weak text-accent rounded-theme hover:opacity-80 transition-all duration-300 font-semibold text-center transform hover:scale-[1.02]"
                                >
                                    Переглянути ❤️
                                </a>
                            </div>
                        </section>

                        {/* Profile Info */}
                        <section className="bg-paper rounded-theme shadow-theme hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-line">
                            <div className="bg-gradient-to-r from-ink to-muted p-6">
                                <h2 className="text-xl font-bold text-accent-foreground flex items-center gap-3">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Особисті дані
                                </h2>
                            </div>
                            <div className="p-6">
                                <ProfileForm user={profile} tenantSlug={tenantSlug} />
                            </div>
                        </section>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Addresses */}
                        <section className="bg-paper rounded-theme shadow-theme hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-line">
                            <div className="bg-gradient-to-r from-accent to-accent p-6">
                                <h2 className="text-xl font-bold text-accent-foreground flex items-center gap-3">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Мої Адреси
                                </h2>
                            </div>
                            <div className="p-6">
                                <AddressBook initialAddresses={addresses} tenantSlug={tenantSlug} />
                            </div>
                        </section>

                        {/* Order History */}
                        <section className="bg-paper rounded-theme shadow-theme hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-line">
                            <div className="bg-gradient-to-r from-accent to-accent p-6">
                                <h2 className="text-xl font-bold text-accent-foreground flex items-center gap-3">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Історія Замовлень
                                </h2>
                            </div>
                            <div className="p-6">
                                <OrderHistory orders={orders} tenantSlug={tenantSlug} />
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
