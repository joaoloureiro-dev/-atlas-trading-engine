import type {
    Instrument,
    TradeDirection,
    TradingMode,
} from "./market.js";

export type OrderType =
    | "MARKET"
    | "LIMIT"
    | "STOP"
    | "STOP_LIMIT";

export interface OrderIntent {
    id: string;

    tenantId: string;

    tradeProposalId: string;
    riskDecisionId: string;

    instrument: Instrument;
    direction: TradeDirection;

    quantity: number;

    orderType: OrderType;

    limitPrice?: number;
    stopPrice?: number;

    tradingMode: TradingMode;

    /**
     * Prevents duplicate execution during retries/failover.
     */
    idempotencyKey: string;

    createdAt: string;
}