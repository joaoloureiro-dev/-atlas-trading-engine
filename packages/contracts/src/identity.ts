export type UserStatus =
    | "ACTIVE"
    | "SUSPENDED"
    | "DISABLED";

export type TenantStatus =
    | "ACTIVE"
    | "SUSPENDED"
    | "DISABLED";

export type TenantRole =
    | "OWNER"
    | "ADMIN"
    | "MEMBER";

export type IdentityProvider =
    | "PRIVY";

export interface User {
    id: string;

    status: UserStatus;

    createdAt: string;
    updatedAt: string;
}

export interface Tenant {
    id: string;

    name: string;
    status: TenantStatus;

    createdAt: string;
    updatedAt: string;
}

export interface TenantMembership {
    id: string;

    tenantId: string;
    userId: string;

    role: TenantRole;

    createdAt: string;
    updatedAt: string;
}

export interface ExternalIdentity {
    id: string;

    userId: string;

    provider: IdentityProvider;

    /**
     * Identifier received from the external authentication provider.
     *
     * This is not used as Atlas's internal user ID.
     */
    providerUserId: string;

    createdAt: string;
    updatedAt: string;
}