import type {
    Portfolio,
    PortfolioConcentration,
    RiskDecision,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import {
    approximatelyEqual,
    evaluateConcentration,
} from "./evaluate-concentration.js";
import {
    evaluateRisk,
} from "./evaluate-risk.js";

export interface EvaluateHardRiskInput {
    decisionId: string;

    proposal: TradeProposal;
    limits: RiskLimits;
    portfolio: Portfolio;

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
    // Copy the inputs once so every check below sees the same values.
    const {
        concentration,
        ...riskInput
    } = structuredClone(input);

    const baseDecision = evaluateRisk(riskInput);

    if (baseDecision.status !== "APPROVED") {
        return baseDecision;
    }

    const reject = (reason: string): RiskDecision => {
        const {
            approvedQuantity: _approvedQuantity,
            takeProfitPrice: _takeProfitPrice,
            ...decision
        } = baseDecision;

        return {
            ...decision,

            status: "REJECTED",

            approvedCapital: 0,

            maxLoss: 0,

            reasons: [reason],
        };
    };

    // Two sources for the same number must agree, or one of them is wrong.
    if (
        !approximatelyEqual(
            concentration.grossExposure,
            riskInput.currentGrossExposure,
        )
    ) {
        return reject(
            "Concentration snapshot does not match the current gross exposure.",
        );
    }

    const concentrationDecision =
        evaluateConcentration({
            proposal: riskInput.proposal,
            limits: riskInput.limits,
            concentration,
            proposedCapital:
                baseDecision.approvedCapital,
        });

    if (!concentrationDecision.approved) {
        return reject(
            concentrationDecision.reason ??
            "Portfolio concentration risk check failed.",
        );
    }

    return {
        ...baseDecision,

        reasons: [
            ...baseDecision.reasons,
            "Market concentration checks passed.",
        ],
    };
}
