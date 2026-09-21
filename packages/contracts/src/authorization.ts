import type { TenantRole } from "./identity.js";

export const ATLAS_PERMISSIONS = [
    "TENANT_READ",
    "TENANT_MANAGE",

    "BROKER_CONNECTION_READ",
    "BROKER_CONNECTION_MANAGE",

    "PORTFOLIO_READ",

    "TRADE_READ",

    "TRADING_SETTINGS_READ",
    "TRADING_SETTINGS_MANAGE",

    "RISK_SETTINGS_READ",
    "RISK_SETTINGS_MANAGE",

    "LIVE_TRADING_ENABLE",
    "LIVE_TRADING_DISABLE",

    "AUDIT_LOG_READ",
] as const;

export type AtlasPermission =
    (typeof ATLAS_PERMISSIONS)[number];

export interface AuthorizationContext {
    userId: string;
    tenantId: string;

    role: TenantRole;

    permissions: AtlasPermission[];
}

export interface AuthorizationDecision {
    allowed: boolean;

    userId: string;
    tenantId: string;

    permission: AtlasPermission;

    reason?: string;
}