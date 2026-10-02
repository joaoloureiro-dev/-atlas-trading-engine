import type { MarketType, TradingMode } from "./market.js";

export interface Portfolio {
    id: string;
    tenantId: string;

    name: string;
    baseCurrency: string;

    tradingMode: TradingMode;

    createdAt: string;
    updatedAt: string;
}

export interface PortfolioPosition {
    id: string;

    tenantId: string;
    portfolioId: string;

    market: MarketType;
    symbol: string;

    quantity: number;
    averageEntryPrice: number;
    currentPrice?: number;

    unrealizedPnl?: number;
    realizedPnl: number;

    openedAt: string;
    updatedAt: string;
}

export interface PortfolioExposure {
    tenantId: string;
    portfolioId: string;

    grossExposure: number;
    netExposure: number;

    longExposure: number;
    shortExposure: number;

    availableCapital: number;

    calculatedAt: string;
}