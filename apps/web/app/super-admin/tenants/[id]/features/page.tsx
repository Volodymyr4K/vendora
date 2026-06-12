import { FeatureManagement } from "@/components/super-admin/FeatureManagement";
import { getSuperTenantByIdAction } from "@/app/actions";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function FeaturesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const tenant = await getSuperTenantByIdAction(id);
    if (!tenant) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            <div className="max-w-5xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/super-admin"
                        className="text-gray-600 hover:text-gray-900 mb-4 inline-flex items-center gap-2"
                    >
                        ← Back to Tenants
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 mt-4">
                        Модулі та фічі
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Панель редагування тенанта (модулі/фічі): <span className="font-semibold text-blue-600">{tenant.name}</span> ({tenant.slug})
                    </p>
                </div>

                <FeatureManagement tenant={tenant} />
            </div>
        </div>
    );
}
