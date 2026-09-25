import type { TenantContext } from "./tenant-context.js";

export interface TenantTransactionContext extends TenantContext {
    correlationId: string;
}