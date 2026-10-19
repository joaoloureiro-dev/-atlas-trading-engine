import { describe, expect, it } from "vitest";

import type {
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import { evaluateRisk } from "./evaluate-risk.js";

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
    maxMarketConcentrationPercentage: 50,
    maxOpenPositions: 10,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe("evaluateRisk", () => {
    it("approves a valid trade and sizes it by risk", () => {
        const result = evaluateRisk({
            decisionId: "decision-1",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("APPROVED");

        expect(result.approvedCapital).toBe(1_000);
        expect(result.approvedQuantity).toBe(10);
        expect(result.maxLoss).toBe(50);

        expect(result.stopLossPrice).toBe(95);
        expect(result.takeProfitPrice).toBe(120);
    });

    it("rejects when maximum daily loss is reached", () => {
        const result = evaluateRisk({
            decisionId: "decision-2",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: -500,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum daily loss reached.",
        );
    });

    it("rejects when maximum drawdown is reached", () => {
        const result = evaluateRisk({
            decisionId: "decision-3",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 20,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum drawdown reached.",
        );
    });

    it("rejects when maximum gross exposure is reached", () => {
        const result = evaluateRisk({
            decisionId: "decision-4",
            proposal,
            limits,
            currentGrossExposure: 10_000,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum gross exposure reached.",
        );
    });

    it("rejects when maximum net exposure is reached", () => {
        const result = evaluateRisk({
            decisionId: "decision-5",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 5_000,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum net exposure reached.",
        );
    });

    it("approves a valid short trade and sizes it by risk", () => {
        const result = evaluateRisk({
            decisionId: "decision-6",
            proposal: {
                ...proposal,
                id: "proposal-short",
                direction: "SHORT",
                suggestedEntry: 100,
                invalidationPrice: 105,
                suggestedTakeProfit: 80,
            },
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("APPROVED");

        expect(result.approvedCapital).toBe(1_000);
        expect(result.approvedQuantity).toBe(10);
        expect(result.maxLoss).toBe(50);

        expect(result.stopLossPrice).toBe(105);
        expect(result.takeProfitPrice).toBe(80);
    });

    it("rejects proposals from another tenant", () => {
        expect(() =>
            evaluateRisk({
                decisionId: "decision-7",
                proposal: {
                    ...proposal,
                    tenantId: "tenant-2",
                },
                limits,
                currentGrossExposure: 0,
                currentNetExposure: 0,
                currentDailyPnl: 0,
                currentDrawdownPercentage: 0,
                currentOpenPositions: 0,
            }),
        ).toThrow(
            "Risk evaluation received a proposal from another tenant.",
        );
    });

    it("rejects when suggested entry price is invalid", () => {
        const result = evaluateRisk({
            decisionId: "decision-8",
            proposal: {
                ...proposal,
                suggestedEntry: 0,
            },
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "A valid suggested entry price is required for risk sizing.",
        );
    });

    it("rejects a long trade with invalid stop placement", () => {
        const result = evaluateRisk({
            decisionId: "decision-9",
            proposal: {
                ...proposal,
                direction: "LONG",
                suggestedEntry: 100,
                invalidationPrice: 105,
            },
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Long trade invalidation price must be below entry price.",
        );
    });

    it("rejects a short trade with invalid stop placement", () => {
        const result = evaluateRisk({
            decisionId: "decision-10",
            proposal: {
                ...proposal,
                direction: "SHORT",
                suggestedEntry: 100,
                invalidationPrice: 95,
            },
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 0,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Short trade invalidation price must be above entry price.",
        );
    });

    it("rejects when maximum number of open positions is reached", () => {
        const result = evaluateRisk({
            decisionId: "decision-11",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: 10,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Maximum number of open positions reached.",
        );
    });

    it("rejects an invalid open position count", () => {
        const result = evaluateRisk({
            decisionId: "decision-12",
            proposal,
            limits,
            currentGrossExposure: 0,
            currentNetExposure: 0,
            currentDailyPnl: 0,
            currentDrawdownPercentage: 0,
            currentOpenPositions: -1,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Current open position count must be a valid non-negative integer.",
        );
    });
});