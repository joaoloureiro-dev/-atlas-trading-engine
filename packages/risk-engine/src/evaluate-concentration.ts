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

    if (!Number.isFinite(proposedCapital) || proposedCapital <= 0) {
        return {
            approved: false,
            reason: "Proposed capital must be greater than zero.",
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