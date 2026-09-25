export class TenantAccessDeniedError extends Error {
    constructor() {
        super("Access to the requested tenant resource was denied.");
        this.name = "TenantAccessDeniedError";
    }
}

export class CrossTenantOperationError extends Error {
    constructor() {
        super("Cross-tenant database operations are not permitted.");
        this.name = "CrossTenantOperationError";
    }
}