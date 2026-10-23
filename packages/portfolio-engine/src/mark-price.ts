import {
    MARKET_TYPES,
    type PortfolioPosition,
} from "@atlas/contracts";

/**
 * Validates a position used for exposure and returns the price it is marked
 * at. A zero, negative or missing price would understate exposure and let the
 * risk engine approve more than the limits allow, so it is rejected.
 */
export function positionMarkPrice(
    position: PortfolioPosition,
): number {
    if (!MARKET_TYPES.includes(position.market)) {
        throw new Error("Position market is invalid.");
    }

    if (!Number.isFinite(position.quantity)) {
        throw new Error("Position quantity must be finite.");
    }

    const price =
        position.currentPrice ??
        position.averageEntryPrice;

    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(
            "Position price must be a positive finite number.",
        );
    }

    return price;
}
