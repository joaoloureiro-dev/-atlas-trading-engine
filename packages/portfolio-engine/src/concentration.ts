import type {
    MarketType,
    PortfolioPosition,
} from "@atlas/contracts";

export interface MarketExposure {
    market: MarketType;
    exposure: number;
    percentageOfGrossExposure: number;
}

export interface PortfolioConcentration {
    tenantId: string;
    portfolioId: string;

    grossExposure: number;
    markets: MarketExposure[];

    largestMarket?: MarketExposure;

    calculatedAt: string;
}

export interface CalculatePortfolioConcentrationInput {
    tenantId: string;
    portfolioId: string;
    positions: PortfolioPosition[];
}

export function calculatePortfolioConcentration(
    input: CalculatePortfolioConcentrationInput,
): PortfolioConcentration {
    const exposureByMarket = new Map<MarketType, number>();

    for (const position of input.positions) {
        if (
            position.tenantId !== input.tenantId ||
            position.portfolioId !== input.portfolioId
        ) {
            throw new Error(
                "Portfolio concentration calculation received a position from another tenant or portfolio.",
            );
        }

        const price =
            position.currentPrice ??
            position.averageEntryPrice;

        const exposure = Math.abs(
            position.quantity * price,
        );

        const currentExposure =
            exposureByMarket.get(position.market) ?? 0;

        exposureByMarket.set(
            position.market,
            currentExposure + exposure,
        );
    }

    const grossExposure = Array.from(
        exposureByMarket.values(),
    ).reduce(
        (total, exposure) => total + exposure,
        0,
    );

    const markets: MarketExposure[] = Array.from(
        exposureByMarket.entries(),
    )
        .map(([market, exposure]) => ({
            market,
            exposure,
            percentageOfGrossExposure:
                grossExposure === 0
                    ? 0
                    : (exposure / grossExposure) * 100,
        }))
        .sort(
            (a, b) =>
                b.exposure - a.exposure,
        );

    const largestMarket = markets[0];

    return {
        tenantId: input.tenantId,
        portfolioId: input.portfolioId,
        grossExposure,
        markets,
        ...(largestMarket
            ? { largestMarket }
            : {}),
        calculatedAt: new Date().toISOString(),
    };
}