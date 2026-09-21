export const MARKET_TYPES = [
    "CRYPTO",
    "FOREX",
    "STOCKS",
    "FUTURES",
    "OPTIONS",
    "COMMODITIES",
] as const;

export type MarketType = (typeof MARKET_TYPES)[number];

export const TRADING_MODES = ["PAPER", "SHADOW", "LIVE"] as const;

export type TradingMode = (typeof TRADING_MODES)[number];

export type TradeDirection = "LONG" | "SHORT";

export interface Instrument {
    symbol: string;
    market: MarketType;

    /**
     * Broker/exchange-specific identifier when required.
     */
    externalId?: string;

    baseAsset?: string;
    quoteAsset?: string;
}