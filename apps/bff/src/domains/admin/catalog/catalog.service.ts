import { AdminDeps } from "../types.js";
import { CacheKeys } from "../../../services/cache-keys.js";

export const invalidateMenu = async (deps: AdminDeps, tenantId: string) => {
    const pattern = CacheKeys.menuPattern(tenantId);
    if (deps.pubsub) {
        await deps.pubsub.publishInvalidation(pattern);
    } else {
        await deps.cache.delPattern(pattern);
    }
};
