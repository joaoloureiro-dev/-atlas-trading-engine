import { describe, expect, it } from "vitest";

import type { PortfolioPosition } from "@atlas/contracts";

import { calculatePortfolioConcentration } from "./concentration.js";

const positions: PortfolioPosition[] = [
    {
        id: "position-1",
        tenantId: "tenant-1",
        portfolioId: "portfolio-1",
        market: "CRYPTO",
        symbol: "BTC-USD",
        quantity: 2,
        averageEntryPrice: 100,
        currentPrice: 100,
        realizedPnl: 0,
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: "position-2",
        tenantId: "tenant-1",
        portfolioId: "portfolio-1",
        market: "STOCKS",
        symbol: "NVDA",
        quantity: 1,
        averageEntryPrice: 100,
        currentPrice: 100,
        realizedPnl: 0,
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

describe("calculatePortfolioConcentration", () => {
    it("calculates exposure and percentage by market", () => {
        const result = calculatePortfolioConcentration({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            positions,
        });

        expect(result.grossExposure).toBe(300);

        expect(result.markets).toHaveLength(2);

        expect(result.markets[0]?.market).toBe("CRYPTO");
        expect(result.markets[0]?.exposure).toBe(200);
        expect(result.markets[0]?.percentageOfGrossExposure).toBeCloseTo(
            66.6667,
            3,
        );

        expect(result.markets[1]?.market).toBe("STOCKS");
        expect(result.markets[1]?.exposure).toBe(100);
        expect(result.markets[1]?.percentageOfGrossExposure).toBeCloseTo(
            33.3333,
            3,
        );
    });

    it("identifies the largest market exposure", () => {
        const result = calculatePortfolioConcentration({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            positions,
        });

        expect(result.largestMarket?.market).toBe("CRYPTO");
        expect(result.largestMarket?.exposure).toBe(200);
    });

    it("handles an empty portfolio", () => {
        const result = calculatePortfolioConcentration({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            positions: [],
        });

        expect(result.grossExposure).toBe(0);
        expect(result.markets).toEqual([]);
        expect(result.largestMarket).toBeUndefined();
    });

    it("rejects cross-tenant positions", () => {
        expect(() =>
            calculatePortfolioConcentration({
                tenantId: "tenant-2",
                portfolioId: "portfolio-1",
                positions,
            }),
        ).toThrow(
            "Portfolio concentration calculation received a position from another tenant or portfolio.",
        );
    });
});