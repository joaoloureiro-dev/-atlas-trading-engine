import type { PortfolioPosition } from "@atlas/contracts";

export interface PositionValuation {
    tenantId: string;
    portfolioId: string;
    positionId: string;

    symbol: string;

    marketValue: number;

    unrealizedPnl: number;
    realizedPnl: number;
    totalPnl: number;

    calculatedAt: string;
}

export function calculatePositionValuation(
    position: PortfolioPosition,
): PositionValuation {
    if (!Number.isFinite(position.quantity)) {
        throw new Error("Position quantity must be finite.");
    }

    if (!Number.isFinite(position.averageEntryPrice)) {
        throw new Error("Average entry price must be finite.");
    }

    if (position.averageEntryPrice < 0) {
        throw new Error("Average entry price cannot be negative.");
    }

    const currentPrice =
        position.currentPrice ?? position.averageEntryPrice;

    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
        throw new Error("Current price must be a valid non-negative number.");
    }

    const marketValue = Math.abs(position.quantity * currentPrice);

    const unrealizedPnl =
        position.quantity *
        (currentPrice - position.averageEntryPrice);

    const realizedPnl = position.realizedPnl;

    if (!Number.isFinite(realizedPnl)) {
        throw new Error("Realized PnL must be finite.");
    }

    return {
        tenantId: position.tenantId,
        portfolioId: position.portfolioId,
        positionId: position.id,

        symbol: position.symbol,

        marketValue,

        unrealizedPnl,
        realizedPnl,
        totalPnl: unrealizedPnl + realizedPnl,

        calculatedAt: new Date().toISOString(),
    };
}