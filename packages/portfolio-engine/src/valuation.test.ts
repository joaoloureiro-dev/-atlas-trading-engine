import { describe, expect, it } from "vitest";

import type { PortfolioPosition } from "@atlas/contracts";

import { calculatePositionValuation } from "./valuation.js";

const basePosition: PortfolioPosition = {
    id: "position-1",
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    market: "CRYPTO",
    symbol: "BTC-USD",
    quantity: 2,
    averageEntryPrice: 100,
    currentPrice: 120,
    realizedPnl: 10,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe("calculatePositionValuation", () => {
    it("calculates market value and pnl for a long position", () => {
        const result = calculatePositionValuation(basePosition);

        expect(result.marketValue).toBe(240);
        expect(result.unrealizedPnl).toBe(40);
        expect(result.realizedPnl).toBe(10);
        expect(result.totalPnl).toBe(50);
    });

    it("calculates pnl correctly for a short position", () => {
        const result = calculatePositionValuation({
            ...basePosition,
            quantity: -2,
            currentPrice: 80,
        });

        expect(result.marketValue).toBe(160);
        expect(result.unrealizedPnl).toBe(40);
    });

    it("uses average entry price when current price is missing", () => {
        const {
            currentPrice: _currentPrice,
            ...positionWithoutCurrentPrice
        } = basePosition;

        const result = calculatePositionValuation(
            positionWithoutCurrentPrice,
        );

        expect(result.marketValue).toBe(200);
        expect(result.unrealizedPnl).toBe(0);
    });

    it("rejects invalid prices", () => {
        expect(() =>
            calculatePositionValuation({
                ...basePosition,
                currentPrice: -1,
            }),
        ).toThrow(
            "Current price must be a valid non-negative number.",
        );
    });

    it("rejects non-finite quantities", () => {
        expect(() =>
            calculatePositionValuation({
                ...basePosition,
                quantity: Number.POSITIVE_INFINITY,
            }),
        ).toThrow("Position quantity must be finite.");
    });
});