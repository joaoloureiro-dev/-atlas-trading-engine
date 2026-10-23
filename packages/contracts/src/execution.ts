import type {
    Instrument,
    TradeDirection,
    TradingMode,
} from "./market.js";

export const ORDER_TYPES = [
    "MARKET",
    "LIMIT",
    "STOP",
    "STOP_LIMIT",
] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export interface OrderIntent {
    id: string;

    tenantId: string;

    tradeProposalId: string;
    riskDecisionId: string;

    instrument: Instrument;
    direction: TradeDirection;

    quantity: number;

    orderType: OrderType;

    /**
     * For MARKET orders this is the worst acceptable fill price and is
     * required, so a market order can never fill without a price bound.
     */
    limitPrice?: number;
    stopPrice?: number;

    tradingMode: TradingMode;

    /**
     * Prevents duplicate execution during retries/failover.
     */
    idempotencyKey: string;

    createdAt: string;
}