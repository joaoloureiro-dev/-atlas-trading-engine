import type {
    Instrument,
    TradeDirection,
    TradingMode,
} from "./market.js";

import type { AgentType } from "./agent.js";

export interface TradeProposal {
    id: string;

    tenantId: string;

    agent: AgentType;
    instrument: Instrument;

    direction: TradeDirection;
    tradingMode: TradingMode;

    strategy: string;
    modelVersion: string;

    confidence: number;
    expectedEdge: number;

    volatility: number;
    liquidityScore: number;
    newsImpactScore: number;
    patternConfidence: number;

    suggestedEntry?: number;
    invalidationPrice: number;
    suggestedTakeProfit?: number;

    expectedHoldingTimeMs: number;

    rationale: string[];

    createdAt: string;
    expiresAt: string;
}