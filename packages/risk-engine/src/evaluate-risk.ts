import type {
    RiskDecision,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

export interface EvaluateRiskInput {
    decisionId: string;

    proposal: TradeProposal;
    limits: RiskLimits;

    currentGrossExposure: number;
    currentNetExposure: number;

    currentDailyPnl: number;
    currentDrawdownPercentage: number;
}

export function evaluateRisk(
    input: EvaluateRiskInput,
): RiskDecision {
    const {
        decisionId,
        proposal,
        limits,
        currentGrossExposure,
        currentNetExposure,
        currentDailyPnl,
        currentDrawdownPercentage,
    } = input;

    const reject = (
        reason: string,
        stopLossPrice = proposal.invalidationPrice,
    ): RiskDecision => ({
        id: decisionId,
        tenantId: proposal.tenantId,
        tradeProposalId: proposal.id,

        status: "REJECTED",

        approvedCapital: 0,

        maxLoss: 0,

        stopLossPrice,

        tradingMode: proposal.tradingMode,

        reasons: [reason],

        createdAt: new Date().toISOString(),
    });

    if (proposal.tenantId !== limits.tenantId) {
        throw new Error(
            "Risk evaluation received a proposal from another tenant.",
        );
    }

    if (
        currentDailyPnl <=
        -Math.abs(limits.maxDailyLoss)
    ) {
        return reject("Maximum daily loss reached.");
    }

    if (
        currentDrawdownPercentage >=
        limits.maxDrawdownPercentage
    ) {
        return reject("Maximum drawdown reached.");
    }

    if (
        currentGrossExposure >=
        limits.maxGrossExposure
    ) {
        return reject("Maximum gross exposure reached.");
    }

    if (
        Math.abs(currentNetExposure) >=
        limits.maxNetExposure
    ) {
        return reject("Maximum net exposure reached.");
    }

    const entryPrice = proposal.suggestedEntry;

    if (
        entryPrice === undefined ||
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0
    ) {
        return reject(
            "A valid suggested entry price is required for risk sizing.",
        );
    }

    if (
        !Number.isFinite(proposal.invalidationPrice) ||
        proposal.invalidationPrice <= 0
    ) {
        return reject("A valid invalidation price is required.");
    }

    if (
        proposal.direction === "LONG" &&
        proposal.invalidationPrice >= entryPrice
    ) {
        return reject(
            "Long trade invalidation price must be below entry price.",
        );
    }

    if (
        proposal.direction === "SHORT" &&
        proposal.invalidationPrice <= entryPrice
    ) {
        return reject(
            "Short trade invalidation price must be above entry price.",
        );
    }

    const riskPerUnit = Math.abs(
        entryPrice - proposal.invalidationPrice,
    );

    if (riskPerUnit <= 0) {
        return reject(
            "Trade risk per unit must be greater than zero.",
        );
    }

    const quantityByRisk =
        limits.maxRiskPerTrade / riskPerUnit;

    const notionalByRisk =
        quantityByRisk * entryPrice;

    const grossExposureHeadroom =
        limits.maxGrossExposure -
        currentGrossExposure;

    const netExposureHeadroom =
        proposal.direction === "LONG"
            ? limits.maxNetExposure -
            currentNetExposure
            : limits.maxNetExposure +
            currentNetExposure;

    const approvedCapital = Math.min(
        limits.maxPositionNotional,
        notionalByRisk,
        grossExposureHeadroom,
        netExposureHeadroom,
    );

    if (
        !Number.isFinite(approvedCapital) ||
        approvedCapital <= 0
    ) {
        return reject(
            "No portfolio risk capacity is available for this trade.",
        );
    }

    const approvedQuantity =
        approvedCapital / entryPrice;

    const maxLoss =
        approvedQuantity * riskPerUnit;

    return {
        id: decisionId,
        tenantId: proposal.tenantId,
        tradeProposalId: proposal.id,

        status: "APPROVED",

        approvedCapital,
        approvedQuantity,

        maxLoss,

        stopLossPrice: proposal.invalidationPrice,

        ...(proposal.suggestedTakeProfit !== undefined
            ? {
                takeProfitPrice:
                    proposal.suggestedTakeProfit,
            }
            : {}),

        tradingMode: proposal.tradingMode,

        reasons: [
            "Hard risk checks passed.",
            "Position size was determined by portfolio and per-trade risk limits.",
        ],

        createdAt: new Date().toISOString(),
    };
}