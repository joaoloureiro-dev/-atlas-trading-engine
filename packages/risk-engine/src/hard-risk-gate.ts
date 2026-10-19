import type {
    PortfolioConcentration,
    RiskDecision,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import {
    evaluateConcentration,
} from "./evaluate-concentration.js";
import {
    evaluateRisk,
} from "./evaluate-risk.js";

export interface EvaluateHardRiskInput {
    decisionId: string;

    proposal: TradeProposal;
    limits: RiskLimits;

    concentration: PortfolioConcentration;

    currentGrossExposure: number;
    currentNetExposure: number;

    currentDailyPnl: number;
    currentDrawdownPercentage: number;

    currentOpenPositions: number;
}

export function evaluateHardRisk(
    input: EvaluateHardRiskInput,
): RiskDecision {
    const {
        decisionId,
        proposal,
        limits,
        concentration,
        currentGrossExposure,
        currentNetExposure,
        currentDailyPnl,
        currentDrawdownPercentage,
        currentOpenPositions,
    } = input;

    const baseDecision = evaluateRisk({
        decisionId,
        proposal,
        limits,
        currentGrossExposure,
        currentNetExposure,
        currentDailyPnl,
        currentDrawdownPercentage,
        currentOpenPositions,
    });

    if (baseDecision.status !== "APPROVED") {
        return baseDecision;
    }

    const concentrationDecision =
        evaluateConcentration({
            proposal,
            limits,
            concentration,
            proposedCapital:
                baseDecision.approvedCapital,
        });

    if (!concentrationDecision.approved) {
        return {
            id: decisionId,
            tenantId: proposal.tenantId,
            tradeProposalId: proposal.id,

            status: "REJECTED",

            approvedCapital: 0,

            maxLoss: 0,

            stopLossPrice:
                proposal.invalidationPrice,

            tradingMode:
                proposal.tradingMode,

            reasons: [
                concentrationDecision.reason ??
                "Portfolio concentration risk check failed.",
            ],

            createdAt:
                new Date().toISOString(),
        };
    }

    return {
        ...baseDecision,

        reasons: [
            ...baseDecision.reasons,
            "Market concentration checks passed.",
        ],
    };
}