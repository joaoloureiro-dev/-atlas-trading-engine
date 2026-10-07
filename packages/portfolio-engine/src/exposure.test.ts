import { describe, expect, it } from "vitest";

import type { PortfolioPosition } from "@atlas/contracts";

import { calculatePortfolioExposure } from "./exposure.js";

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
        quantity: -3,
        averageEntryPrice: 50,
        currentPrice: 40,
        realizedPnl: 0,
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

describe("calculatePortfolioExposure", () => {
    it("calculates long, short, gross and net exposure", () => {
        const result = calculatePortfolioExposure({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            availableCapital: 1000,
            positions,
        });

        expect(result.longExposure).toBe(240);
        expect(result.shortExposure).toBe(120);
        expect(result.grossExposure).toBe(360);
        expect(result.netExposure).toBe(120);
        expect(result.availableCapital).toBe(1000);
    });

    it("returns zero exposure for an empty portfolio", () => {
        const result = calculatePortfolioExposure({
            tenantId: "tenant-1",
            portfolioId: "portfolio-1",
            availableCapital: 1000,
            positions: [],
        });

        expect(result.longExposure).toBe(0);
        expect(result.shortExposure).toBe(0);
        expect(result.grossExposure).toBe(0);
        expect(result.netExposure).toBe(0);
    });

    it("rejects positions from another tenant", () => {
        expect(() =>
            calculatePortfolioExposure({
                tenantId: "tenant-2",
                portfolioId: "portfolio-1",
                availableCapital: 1000,
                positions,
            }),
        ).toThrow(
            "Portfolio exposure calculation received a position from another tenant or portfolio.",
        );
    });

    it("rejects positions from another portfolio", () => {
        expect(() =>
            calculatePortfolioExposure({
                tenantId: "tenant-1",
                portfolioId: "portfolio-2",
                availableCapital: 1000,
                positions,
            }),
        ).toThrow(
            "Portfolio exposure calculation received a position from another tenant or portfolio.",
        );
    });
});