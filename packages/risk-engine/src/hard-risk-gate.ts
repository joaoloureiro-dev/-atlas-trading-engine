import type {
    Portfolio,
    PortfolioConcentration,
    RiskDecision,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import {
    approximatelyEqual,
    calculateConcentrationCapacity,
    evaluateConcentration,
    type ConcentrationDecision,
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

    if (
        typeof concentration !== "object" ||
        concentration === null
    ) {
        return reject("Concentration snapshot is malformed.");
    }

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

    const capacity = calculateConcentrationCapacity({
        proposal: riskInput.proposal,
        limits: riskInput.limits,
        concentration,
    });

    if (!capacity.approved) {
        return reject(capacity.reason);
    }

    if (capacity.maxCapital <= 0) {
        return reject(
            "Maximum market concentration would be exceeded.",
        );
    }

    // Size the trade down to what the concentration limits allow instead of
    // rejecting it outright. Near 100% limits float error can exceed the
    // sizing margin, so retry with wider margins before giving up.
    const sizedByConcentration =
        capacity.maxCapital < baseDecision.approvedCapital;

    const margins = sizedByConcentration ? [1, 1 - 1e-6, 1 - 1e-3] : [1];

    let decision = baseDecision;
    let concentrationDecision: ConcentrationDecision = {
        approved: false,
    };

    for (const margin of margins) {
        decision = sizedByConcentration
            ? evaluateRisk({
                ...riskInput,
                maxCapitalByConcentration: capacity.maxCapital * margin,
            })
            : baseDecision;

        if (decision.status !== "APPROVED") {
            return decision;
        }

        // Defence in depth: the sized trade must pass the concentration
        // checks.
        concentrationDecision = evaluateConcentration({
            proposal: riskInput.proposal,
            limits: riskInput.limits,
            concentration,
            proposedCapital: decision.approvedCapital,
        });

        if (concentrationDecision.approved) {
            break;
        }
    }

    if (!concentrationDecision.approved) {
        return reject(
            concentrationDecision.reason ??
            "Portfolio concentration risk check failed.",
        );
    }

    return {
        ...decision,

        reasons: [
            ...decision.reasons,
            ...(!sizedByConcentration
                ? []
                : [
                    "Position size was reduced to fit market concentration limits.",
                ]),
            "Market concentration checks passed.",
        ],
    };
}
