import type { TradingMode } from "./market.js";

export type RiskDecisionStatus =
    | "APPROVED"
    | "REDUCED"
    | "REJECTED";

export interface RiskDecision {
    id: string;

    tenantId: string;
    tradeProposalId: string;

    status: RiskDecisionStatus;

    approvedCapital: number;
    approvedQuantity?: number;

    maxLoss: number;

    stopLossPrice: number;
    takeProfitPrice?: number;

    tradingMode: TradingMode;

    reasons: string[];

    createdAt: string;
}