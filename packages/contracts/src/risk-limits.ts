import type { MarketType } from "./market.js";

export interface RiskLimits {
    tenantId: string;
    portfolioId: string;

    maxPositionNotional: number;
    maxRiskPerTrade: number;
    maxGrossExposure: number;
    maxNetExposure: number;
    maxDailyLoss: number;
    maxDrawdownPercentage: number;

    maxMarketConcentrationPercentage: number;

    maxOpenPositions?: number;

    marketLimits?: Partial<
        Record<
            MarketType,
            {
                maxExposure: number;
                maxConcentrationPercentage: number;
            }
        >
    >;

    createdAt: string;
    updatedAt: string;
}