export interface TenantContext {
    tenantId: string;
    userId: string;
}

export class MissingTenantContextError extends Error {
    constructor() {
        super("A tenant context is required for this database operation.");
        this.name = "MissingTenantContextError";
    }
}
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertTenantContext(
    context: TenantContext,
): TenantContext {
    if (
        !UUID_PATTERN.test(context.tenantId) ||
        !UUID_PATTERN.test(context.userId)
    ) {
        throw new Error("Invalid tenant context.");
    }

    return context;
}