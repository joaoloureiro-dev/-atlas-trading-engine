import type { MarketType } from "./market.js";

export const AGENT_TYPES = [
    "CRYPTO",
    "FOREX",
    "STOCKS",
    "FUTURES",
    "OPTIONS",
    "COMMODITIES",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export interface AgentIdentity {
    id: string;
    type: AgentType;
    market: MarketType;
    version: string;
}

export interface AgentHealth {
    agentId: string;
    healthy: boolean;
    lastHeartbeatAt: string;
}