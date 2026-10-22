import type {
    PortfolioConcentration,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

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
    const {
        proposal,
        limits,
        concentration,
        proposedCapital,
    } = input;

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

    if (
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