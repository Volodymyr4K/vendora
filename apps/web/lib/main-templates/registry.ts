import "server-only";
import type { MainTemplateId } from "@vendora/contracts";
import type { AmContentV1 } from "@/lib/am-content";
import type { ReactElement } from "react";

export type MainTemplateComponent = (props: { tenantSlug: string; branchSlug?: string; amContent?: AmContentV1 }) => ReactElement | Promise<ReactElement>;

const registry: Record<MainTemplateId, () => Promise<{ default: MainTemplateComponent }>> = {
    default: () => import("@/components/main-templates/default/Main"),
    "berlin-press": () => import("@/components/main-templates/berlin-press/Main"),
};

export async function resolveMainTemplate(templateId: MainTemplateId): Promise<MainTemplateComponent> {
    const loader = registry[templateId] ?? registry.default;
    const mod = await loader();
    return mod.default;
}
