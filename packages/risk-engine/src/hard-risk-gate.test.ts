import { describe, expect, it } from "vitest";

import type {
    PortfolioConcentration,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import { evaluateHardRisk } from "./hard-risk-gate.js";

const proposal: TradeProposal = {
    id: "proposal-1",
    tenantId: "tenant-1",
    agent: "CRYPTO",
    instrument: {
        symbol: "BTC-USD",
        market: "CRYPTO",
    },
    direction: "LONG",
    tradingMode: "PAPER",
    strategy: "test-strategy",
    modelVersion: "v1",
    confidence: 0.9,
    expectedEdge: 0.05,
    volatility: 0.2,
    liquidityScore: 0.9,
    newsImpactScore: 0.1,
    patternConfidence: 0.8,
    suggestedEntry: 100,
    invalidationPrice: 95,
    suggestedTakeProfit: 120,
    expectedHoldingTimeMs: 60_000,
    rationale: ["Test proposal"],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(
        Date.now() + 60_000,
    ).toISOString(),
};

const limits: RiskLimits = {
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    maxPositionNotional: 1_000,
    maxRiskPerTrade: 50,
    maxGrossExposure: 10_000,
    maxNetExposure: 5_000,
    maxDailyLoss: 500,
    maxDrawdownPercentage: 20,
    maxMarketConcentrationPercentage: 70,
    maxOpenPositions: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const concentration: PortfolioConcentration = {
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    grossExposure: 2_000,
    markets: [
        {
            market: "CRYPTO",
            exposure: 500,
            percentageOfGrossExposure: 25,
        },
        {
            market: "STOCKS",
            exposure: 1_500,
            percentageOfGrossExposure: 75,
        },
    ],
    calculatedAt: new Date().toISOString(),
};

describe("evaluateHardRisk", () => {
    it("approves when all hard risk checks pass", () => {
        const result = evaluateHardRisk({
            decisionId: "decision-1",
            proposal,
            limits,
            concentration,
            currentGrossExposure: 2_000,
            currentNetExposure: 500,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 2,
        });

        expect(result.status).toBe("APPROVED");
        expect(result.approvedCapital).toBeGreaterThan(0);

        expect(result.reasons).toContain(
            "Market concentration checks passed.",
        );
    });

    it("stops immediately when base risk checks fail", () => {
        const result = evaluateHardRisk({
            decisionId: "decision-2",
            proposal,
            limits,
            concentration,
            currentGrossExposure: 2_000,
            currentNetExposure: 500,
            currentDailyPnl: -500,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 2,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum daily loss reached.",
        );
    });

    it("rejects when projected concentration exceeds the limit", () => {
        const result = evaluateHardRisk({
            decisionId: "decision-3",
            proposal,
            limits: {
                ...limits,
                maxMarketConcentrationPercentage: 40,
            },
            concentration,
            currentGrossExposure: 2_000,
            currentNetExposure: 500,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 2,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.approvedCapital).toBe(0);

        expect(result.reasons).toContain(
            "Maximum market concentration would be exceeded.",
        );
    });

    it("rejects when market-specific exposure would be exceeded", () => {
        const result = evaluateHardRisk({
            decisionId: "decision-4",
            proposal,
            limits: {
                ...limits,
                marketLimits: {
                    CRYPTO: {
                        maxExposure: 1_000,
                        maxConcentrationPercentage: 80,
                    },
                },
            },
            concentration,
            currentGrossExposure: 2_000,
            currentNetExposure: 500,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 2,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum market-specific exposure would be exceeded.",
        );
    });
});