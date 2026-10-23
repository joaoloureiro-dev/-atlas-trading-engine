import { describe, expect, it } from "vitest";

import type { PortfolioPosition } from "@atlas/contracts";

import { calculatePortfolioConcentration } from "./concentration.js";
import { calculatePortfolioExposure } from "./exposure.js";

// Regression tests for positions that would understate portfolio exposure.

const position: PortfolioPosition = {
    id: "position-1",
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    market: "CRYPTO",
    symbol: "ETH-USD",
    quantity: 49,
    averageEntryPrice: 1_000,
    currentPrice: 1_000,
    realizedPnl: 0,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const calculators = [
    [
        "exposure",
        (positions: PortfolioPosition[]) =>
            calculatePortfolioExposure({
                tenantId: "tenant-1",
                portfolioId: "portfolio-1",
                availableCapital: 0,
                positions,
            }),
    ],
    [
        "concentration",
        (positions: PortfolioPosition[]) =>
            calculatePortfolioConcentration({
                tenantId: "tenant-1",
                portfolioId: "portfolio-1",
                positions,
            }),
    ],
] as const;

describe.each(calculators)("%s", (_name, calculate) => {
    it.each([0, -1, NaN, Infinity])(
        "rejects current price %d",
        (currentPrice) => {
            expect(() =>
                calculate([{ ...position, currentPrice }]),
            ).toThrow(
                "Position price must be a positive finite number.",
            );
        },
    );

    it("rejects an invalid average entry price when unmarked", () => {
        const {
            currentPrice: _currentPrice,
            ...unmarked
        } = position;

        expect(() =>
            calculate([{ ...unmarked, averageEntryPrice: -1 }]),
        ).toThrow(
            "Position price must be a positive finite number.",
        );
    });

    it.each(["crypto", "CRYPTO ", ""])(
        "rejects market %j",
        (market) => {
            expect(() =>
                calculate([
                    { ...position, market: market as never },
                ]),
            ).toThrow("Position market is invalid.");
        },
    );

    it("rejects a non-finite quantity", () => {
        expect(() =>
            calculate([{ ...position, quantity: NaN }]),
        ).toThrow("Position quantity must be finite.");
    });
});
