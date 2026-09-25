import type { MarketType, TradingMode } from "./market.js";

export const BROKER_TYPES = [
    "BROKER",
    "EXCHANGE",
] as const;

export type BrokerType = (typeof BROKER_TYPES)[number];

export const BROKER_CONNECTION_STATUSES = [
    "PENDING",
    "ACTIVE",
    "DEGRADED",
    "DISCONNECTED",
    "REVOKED",
] as const;

export type BrokerConnectionStatus =
    (typeof BROKER_CONNECTION_STATUSES)[number];

export const BROKER_ACCOUNT_STATUSES = [
    "ACTIVE",
    "RESTRICTED",
    "DISABLED",
] as const;

export type BrokerAccountStatus =
    (typeof BROKER_ACCOUNT_STATUSES)[number];

export interface BrokerConnection {
    id: string;
    tenantId: string;

    provider: string;
    type: BrokerType;

    status: BrokerConnectionStatus;

    /**
     * Reference to encrypted credentials held by the
     * Atlas secrets infrastructure.
     *
     * Never contains the credential itself.
     */
    credentialReference: string;

    createdAt: string;
    updatedAt: string;
}

export interface BrokerAccount {
    id: string;

    tenantId: string;
    brokerConnectionId: string;

    externalAccountId: string;

    status: BrokerAccountStatus;
    tradingMode: TradingMode;

    baseCurrency?: string;

    supportedMarkets: MarketType[];

    createdAt: string;
    updatedAt: string;
}