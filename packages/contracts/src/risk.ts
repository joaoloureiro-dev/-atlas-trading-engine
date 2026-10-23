import type {
    Instrument,
    TradeDirection,
    TradingMode,
} from "./market.js";

export type RiskDecisionStatus =
    | "APPROVED"
    | "REDUCED"
    | "REJECTED";

export interface RiskDecision {
    id: string;

    tenantId: string;
    portfolioId: string;
    tradeProposalId: string;

    /**
     * What was approved. Execution must match these exactly.
     */
    instrument: Instrument;
    direction: TradeDirection;
    entryPrice: number;

    status: RiskDecisionStatus;

    approvedCapital: number;
    approvedQuantity?: number;

    maxLoss: number;

    stopLossPrice: number;
    takeProfitPrice?: number;

    tradingMode: TradingMode;

    reasons: string[];

    createdAt: string;

    /**
     * The decision must not be executed after this time.
     */
    expiresAt: string;
}