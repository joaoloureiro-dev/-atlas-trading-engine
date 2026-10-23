import {
    MARKET_TYPES,
    type PortfolioConcentration,
    type RiskLimits,
    type TradeProposal,
} from "@atlas/contracts";

/**
 * Oldest concentration snapshot accepted for a risk decision.
 */
export const MAX_SNAPSHOT_AGE_MS = 60_000;

const MAX_CLOCK_SKEW_MS = 5_000;

export interface EvaluateConcentrationInput {
    proposal: TradeProposal;
    limits: RiskLimits;
    concentration: PortfolioConcentration;
    proposedCapital: number;
}

export interface ConcentrationDecision {
    approved: boolean;
    reason?: string;
}

export function evaluateConcentration(
    input: EvaluateConcentrationInput,
): ConcentrationDecision {
    // Copy the inputs once so getters or proxies cannot change values
    // between validation and use.
    const {
        proposal,
        limits,
        concentration,
        proposedCapital,
    } = structuredClone(input);

    if (proposal.tenantId !== limits.tenantId) {
        throw new Error(
            "Concentration evaluation received a proposal from another tenant.",
        );
    }

    if (concentration.tenantId !== limits.tenantId) {
        throw new Error(
            "Concentration snapshot belongs to another tenant.",
        );
    }

    if (concentration.portfolioId !== limits.portfolioId) {
        throw new Error(
            "Concentration snapshot belongs to another portfolio.",
        );
    }

    if (proposal.portfolioId !== limits.portfolioId) {
        throw new Error(
            "Concentration evaluation received a proposal for another portfolio.",
        );
    }

    if (!MARKET_TYPES.includes(proposal.instrument.market)) {
        return {
            approved: false,
            reason: "Trade market is invalid.",
        };
    }

    const snapshotAge =
        Date.now() - Date.parse(concentration.calculatedAt);

    if (
        !Number.isFinite(snapshotAge) ||
        snapshotAge > MAX_SNAPSHOT_AGE_MS ||
        snapshotAge < -MAX_CLOCK_SKEW_MS
    ) {
        return {
            approved: false,
            reason: "Concentration snapshot is missing a valid recent timestamp.",
        };
    }

    if (!Number.isFinite(proposedCapital) || proposedCapital <= 0) {
        return {
            approved: false,
            reason: "Proposed capital must be greater than zero.",
        };
    }

    // Comparisons against NaN are always false, so invalid inputs must be
    // rejected explicitly or the limit checks below silently pass.
    if (
        !Number.isFinite(limits.maxMarketConcentrationPercentage) ||
        limits.maxMarketConcentrationPercentage <= 0
    ) {
        return {
            approved: false,
            reason: "Market concentration limit must be a positive finite number.",
        };
    }

    if (
        !Number.isFinite(concentration.grossExposure) ||
        concentration.grossExposure < 0 ||
        !concentration.markets.every(
            ({ exposure }) =>
                Number.isFinite(exposure) && exposure >= 0,
        )
    ) {
        return {
            approved: false,
            reason: "Concentration snapshot must contain valid non-negative exposures.",
        };
    }

    const markets = concentration.markets.map(
        ({ market }) => market,
    );

    if (
        !markets.every((market) => MARKET_TYPES.includes(market)) ||
        new Set(markets).size !== markets.length
    ) {
        return {
            approved: false,
            reason: "Concentration snapshot markets must be valid and unique.",
        };
    }

    const marketExposureTotal = concentration.markets.reduce(
        (total, { exposure }) => total + exposure,
        0,
    );

    if (
        !approximatelyEqual(
            marketExposureTotal,
            concentration.grossExposure,
        )
    ) {
        return {
            approved: false,
            reason: "Concentration snapshot gross exposure does not match its markets.",
        };
    }

    const currentMarketExposure =
        concentration.markets.find(
            ({ market }) =>
                market === proposal.instrument.market,
        )?.exposure ?? 0;

    const projectedGrossExposure =
        concentration.grossExposure + proposedCapital;

    const projectedMarketExposure =
        currentMarketExposure + proposedCapital;

    const projectedConcentrationPercentage =
        projectedGrossExposure === 0
            ? 0
            : (
                projectedMarketExposure /
                projectedGrossExposure
            ) * 100;

    // The first position of an empty portfolio is always 100% of it, so
    // percentage limits only apply once the portfolio has exposure. Absolute
    // market exposure limits still apply.
    const hasExistingExposure = concentration.grossExposure > 0;

    if (
        hasExistingExposure &&
        projectedConcentrationPercentage >
        limits.maxMarketConcentrationPercentage
    ) {
        return {
            approved: false,
            reason:
                "Maximum market concentration would be exceeded.",
        };
    }

    const marketLimit =
        limits.marketLimits?.[
        proposal.instrument.market
        ];

    if (
        marketLimit &&
        (
            !Number.isFinite(marketLimit.maxExposure) ||
            marketLimit.maxExposure < 0 ||
            !Number.isFinite(marketLimit.maxConcentrationPercentage) ||
            marketLimit.maxConcentrationPercentage < 0
        )
    ) {
        return {
            approved: false,
            reason: "Market-specific limits must be valid non-negative numbers.",
        };
    }

    if (
        marketLimit &&
        projectedMarketExposure >
        marketLimit.maxExposure
    ) {
        return {
            approved: false,
            reason:
                "Maximum market-specific exposure would be exceeded.",
        };
    }

    if (
        marketLimit &&
        hasExistingExposure &&
        projectedConcentrationPercentage >
        marketLimit.maxConcentrationPercentage
    ) {
        return {
            approved: false,
            reason:
                "Maximum market-specific concentration would be exceeded.",
        };
    }

    return {
        approved: true,
    };
}

export function approximatelyEqual(a: number, b: number): boolean {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
