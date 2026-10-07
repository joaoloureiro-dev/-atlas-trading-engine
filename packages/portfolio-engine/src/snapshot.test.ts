import { describe, expect, it } from "vitest";

import type { PortfolioPosition } from "@atlas/contracts";

import { calculatePortfolioSnapshot } from "./snapshot.js";

const positions: PortfolioPosition[] = [
    {
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
    },
    {
        id: "position-2",
        tenantId: "tenant-1",
        portfolioId: "portfolio-1",
        market: "STOCKS",
        symbol: "NVDA",
        quantity: -1,
        averageEntryPrice: 100,
        currentPrice: 80,
        realizedPnl: 5,
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

describe("calculatePortfolioSnapshot", () => {
    it("aggregates exposure, concentration and pnl", () => {
        const result = calculatePortfolioSnapshot({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            availableCapital: 1000,
            positions,
        });

        expect(result.positions).toHaveLength(2);

        expect(result.exposure.longExposure).toBe(240);
        expect(result.exposure.shortExposure).toBe(80);
        expect(result.exposure.grossExposure).toBe(320);
        expect(result.exposure.netExposure).toBe(160);

        expect(result.concentration.grossExposure).toBe(320);

        expect(result.totalUnrealizedPnl).toBe(60);
        expect(result.totalRealizedPnl).toBe(15);
        expect(result.totalPnl).toBe(75);
    });

    it("handles an empty portfolio", () => {
        const result = calculatePortfolioSnapshot({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            availableCapital: 1000,
            positions: [],
        });

        expect(result.positions).toEqual([]);
        expect(result.exposure.grossExposure).toBe(0);
        expect(result.concentration.grossExposure).toBe(0);
        expect(result.totalUnrealizedPnl).toBe(0);
        expect(result.totalRealizedPnl).toBe(0);
        expect(result.totalPnl).toBe(0);
    });

    it("rejects cross-tenant positions", () => {
        expect(() =>
            calculatePortfolioSnapshot({
                tenantId: "tenant-2",
                portfolioId: "portfolio-1",
                availableCapital: 1000,
                positions,
            }),
        ).toThrow(
            "Portfolio snapshot received a position from another tenant or portfolio.",
        );
    });
});