import type {
    PortfolioExposure,
    PortfolioPosition,
} from "@atlas/contracts";

import {
    calculatePortfolioConcentration,
    type PortfolioConcentration,
} from "./concentration.js";
import {
    calculatePortfolioExposure,
} from "./exposure.js";
import {
    calculatePositionValuation,
    type PositionValuation,
} from "./valuation.js";

export interface PortfolioSnapshot {
    tenantId: string;
    portfolioId: string;

    exposure: PortfolioExposure;
    concentration: PortfolioConcentration;

    positions: PositionValuation[];

    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    totalPnl: number;

    calculatedAt: string;
}

export interface CalculatePortfolioSnapshotInput {
    tenantId: string;
    portfolioId: string;

    availableCapital: number;

    positions: PortfolioPosition[];
}

export function calculatePortfolioSnapshot(
    input: CalculatePortfolioSnapshotInput,
): PortfolioSnapshot {
    const positions = input.positions.map((position) =>
        calculatePositionValuation(position),
    );

    for (const position of input.positions) {
        if (
            position.tenantId !== input.tenantId ||
            position.portfolioId !== input.portfolioId
        ) {
            throw new Error(
                "Portfolio snapshot received a position from another tenant or portfolio.",
            );
        }
    }

    const exposure = calculatePortfolioExposure({
        tenantId: input.tenantId,
        portfolioId: input.portfolioId,
        availableCapital: input.availableCapital,
        positions: input.positions,
    });

    const concentration =
        calculatePortfolioConcentration({
            tenantId: input.tenantId,
            portfolioId: input.portfolioId,
            positions: input.positions,
        });

    const totalUnrealizedPnl = positions.reduce(
        (total, position) =>
            total + position.unrealizedPnl,
        0,
    );

    const totalRealizedPnl = positions.reduce(
        (total, position) =>
            total + position.realizedPnl,
        0,
    );

    const totalPnl =
        totalUnrealizedPnl + totalRealizedPnl;

    return {
        tenantId: input.tenantId,
        portfolioId: input.portfolioId,

        exposure,
        concentration,
        positions,

        totalUnrealizedPnl,
        totalRealizedPnl,
        totalPnl,

        calculatedAt: new Date().toISOString(),
    };
}