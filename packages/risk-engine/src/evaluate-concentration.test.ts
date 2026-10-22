import { describe, expect, it } from "vitest";

import type {
    PortfolioConcentration,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import { evaluateConcentration } from "./evaluate-concentration.js";

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
    maxMarketConcentrationPercentage: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const concentration: PortfolioConcentration = {
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    grossExposure: 1_000,
    markets: [
        {
            market: "CRYPTO",
            exposure: 400,
            percentageOfGrossExposure: 40,
        },
        {
            market: "STOCKS",
            exposure: 600,
            percentageOfGrossExposure: 60,
        },
    ],
    calculatedAt: new Date().toISOString(),
};

describe("evaluateConcentration", () => {
    it("approves when projected concentration stays within limits", () => {
        const result = evaluateConcentration({
            proposal,
            limits,
            concentration,
            proposedCapital: 200,
        });

        expect(result.approved).toBe(true);
    });

    it("rejects when global market concentration would be exceeded", () => {
        const result = evaluateConcentration({
            proposal,
            limits: {
                ...limits,
                maxMarketConcentrationPercentage: 45,
            },
            concentration,
            proposedCapital: 300,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Maximum market concentration would be exceeded.",
        );
    });

    it("rejects when market-specific exposure would be exceeded", () => {
        const result = evaluateConcentration({
            proposal,
            limits: {
                ...limits,
                marketLimits: {
                    CRYPTO: {
                        maxExposure: 500,
                        maxConcentrationPercentage: 80,
                    },
                },
            },
            concentration,
            proposedCapital: 200,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Maximum market-specific exposure would be exceeded.",
        );
    });

    it("rejects concentration snapshots from another tenant", () => {
        expect(() =>
            evaluateConcentration({
                proposal,
                limits,
                concentration: {
                    ...concentration,
                    tenantId: "tenant-2",
                },
                proposedCapital: 200,
            }),
        ).toThrow(
            "Concentration snapshot belongs to another tenant.",
        );
    });

    it("rejects concentration snapshots from another portfolio", () => {
        expect(() =>
            evaluateConcentration({
                proposal,
                limits,
                concentration: {
                    ...concentration,
                    portfolioId: "portfolio-2",
                },
                proposedCapital: 200,
            }),
        ).toThrow(
            "Concentration snapshot belongs to another portfolio.",
        );
    });

    it("rejects a non-finite concentration limit", () => {
        const result = evaluateConcentration({
            proposal,
            limits: {
                ...limits,
                maxMarketConcentrationPercentage: NaN,
            },
            concentration,
            proposedCapital: 200,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Market concentration limit must be a positive finite number.",
        );
    });

    it("rejects a snapshot with a non-finite gross exposure", () => {
        const result = evaluateConcentration({
            proposal,
            limits,
            concentration: {
                ...concentration,
                grossExposure: NaN,
            },
            proposedCapital: 200,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Concentration snapshot must contain valid non-negative exposures.",
        );
    });

    it("rejects a snapshot with a non-finite market exposure", () => {
        const result = evaluateConcentration({
            proposal,
            limits,
            concentration: {
                ...concentration,
                markets: [
                    {
                        market: "CRYPTO",
                        exposure: NaN,
                        percentageOfGrossExposure: 0,
                    },
                ],
            },
            proposedCapital: 200,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Concentration snapshot must contain valid non-negative exposures.",
        );
    });

    it("rejects non-finite market-specific limits", () => {
        const result = evaluateConcentration({
            proposal,
            limits: {
                ...limits,
                marketLimits: {
                    CRYPTO: {
                        maxExposure: NaN,
                        maxConcentrationPercentage: 80,
                    },
                },
            },
            concentration,
            proposedCapital: 200,
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toBe(
            "Market-specific limits must be valid non-negative numbers.",
        );
    });
});
