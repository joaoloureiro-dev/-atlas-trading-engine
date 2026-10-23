import type {
    PortfolioExposure,
    PortfolioPosition,
} from "@atlas/contracts";

import { positionMarkPrice } from "./mark-price.js";

export interface CalculatePortfolioExposureInput {
    tenantId: string;
    portfolioId: string;
    availableCapital: number;
    positions: PortfolioPosition[];
}

export function calculatePortfolioExposure(
    input: CalculatePortfolioExposureInput,
): PortfolioExposure {
    let longExposure = 0;
    let shortExposure = 0;

    for (const position of input.positions) {
        if (
            position.tenantId !== input.tenantId ||
            position.portfolioId !== input.portfolioId
        ) {
            throw new Error(
                "Portfolio exposure calculation received a position from another tenant or portfolio.",
            );
        }

        const price = positionMarkPrice(position);

        const exposure = Math.abs(position.quantity * price);

        if (position.quantity >= 0) {
            longExposure += exposure;
        } else {
            shortExposure += exposure;
        }
    }

    const grossExposure = longExposure + shortExposure;
    const netExposure = longExposure - shortExposure;

    return {
        tenantId: input.tenantId,
        portfolioId: input.portfolioId,
        grossExposure,
        netExposure,
        longExposure,
        shortExposure,
        availableCapital: input.availableCapital,
        calculatedAt: new Date().toISOString(),
    };
}