import { describe, expect, it } from "vitest";

import type {
    OrderIntent,
    RiskDecision,
} from "@atlas/contracts";

import { validateOrderIntent } from "./validate-order-intent.js";

// Regression tests for order intents that differ from what risk approved.

const riskDecision: RiskDecision = {
    id: "risk-1",
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    tradeProposalId: "proposal-1",
    instrument: {
        symbol: "BTC-USD",
        market: "CRYPTO",
    },
    direction: "LONG",
    entryPrice: 100,
    status: "APPROVED",
    approvedCapital: 2_000,
    approvedQuantity: 20,
    maxLoss: 100,
    stopLossPrice: 95,
    tradingMode: "PAPER",
    reasons: ["Hard risk checks passed."],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const orderIntent: OrderIntent = {
    id: "order-1",
    tenantId: "tenant-1",
    tradeProposalId: "proposal-1",
    riskDecisionId: "risk-1",
    instrument: {
        symbol: "BTC-USD",
        market: "CRYPTO",
    },
    direction: "LONG",
    quantity: 20,
    orderType: "LIMIT",
    limitPrice: 100,
    tradingMode: "PAPER",
    idempotencyKey: "risk-1:order-1",
    createdAt: new Date().toISOString(),
};

const validate = (
    intent: Partial<OrderIntent> | Record<string, unknown>,
    decision: Partial<RiskDecision> | Record<string, unknown> = {},
    reservedQuantity = 0,
) =>
    validateOrderIntent({
        orderIntent: { ...orderIntent, ...intent } as OrderIntent,
        riskDecision: { ...riskDecision, ...decision } as RiskDecision,
        reservedQuantity,
    });

describe("order must match the approved trade", () => {
    it("accepts the control order", () => {
        expect(validate({})).toEqual({ valid: true, reasons: [] });
    });

    it("rejects the opposite direction", () => {
        const result = validate({ direction: "SHORT" });

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain(
            "Order direction does not match the risk decision.",
        );
    });

    it.each([
        { symbol: "DOGE-USD", market: "CRYPTO" },
        { symbol: "BTC-USD", market: "FUTURES" },
        { symbol: "BTC-USD", market: "CRYPTO", externalId: "other" },
    ])("rejects another instrument %j", (instrument) => {
        const result = validate({ instrument });

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain(
            "Order instrument does not match the risk decision.",
        );
    });

    it("rejects an expired decision", () => {
        const result = validate(
            {},
            { expiresAt: "2020-01-01T00:00:00Z" },
        );

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain("Risk decision has expired.");
    });

    it("rejects a decision without an expiry", () => {
        expect(validate({}, { expiresAt: "" }).valid).toBe(false);
    });

    it("rejects an unsupported order type", () => {
        const result = validate({
            orderType: "TRAILING",
            limitPrice: -1,
        });

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain("Order type is not supported.");
    });
});

describe("order prices", () => {
    it.each([1e9, 100.6, 95, 10, -1])(
        "rejects long limit price %d outside the band",
        (limitPrice) => {
            const result = validate({ limitPrice });

            expect(result.valid).toBe(false);
        },
    );

    it("accepts a long limit price at the edge of the band", () => {
        expect(validate({ limitPrice: 100.5 }).valid).toBe(true);
    });

    it("rejects a stop order on the wrong side", () => {
        const result = validate({
            orderType: "STOP",
            limitPrice: undefined,
            stopPrice: 1e9,
        });

        expect(result.valid).toBe(false);
    });

    it("rejects a market order without a worst acceptable price", () => {
        const result = validate({
            orderType: "MARKET",
            limitPrice: undefined,
        });

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain(
            "Market orders require a worst acceptable price.",
        );
    });

    it("bounds short orders around the entry and below the stop", () => {
        const short = {
            direction: "SHORT",
            stopLossPrice: 105,
        };

        expect(
            validate({ direction: "SHORT", limitPrice: 99.5 }, short).valid,
        ).toBe(true);
        expect(
            validate({ direction: "SHORT", limitPrice: 99 }, short).valid,
        ).toBe(false);
        expect(
            validate({ direction: "SHORT", limitPrice: 106 }, short).valid,
        ).toBe(false);
    });

    it("rejects a decision whose stop is on the wrong side of the entry", () => {
        const result = validate({}, { stopLossPrice: 105 });

        expect(result.valid).toBe(false);
        expect(result.reasons).toContain(
            "Risk decision entry and stop loss prices are invalid.",
        );
    });

    it.each([NaN, -1, Infinity])(
        "rejects slippage %d",
        (maxSlippageBps) => {
            const result = validateOrderIntent({
                orderIntent,
                riskDecision,
                reservedQuantity: 0,
                maxSlippageBps,
            });

            expect(result.valid).toBe(false);
        },
    );
});

describe("approved quantity", () => {
    it.each([NaN, Infinity, "20", 0, -5])(
        "rejects approved quantity %j",
        (approvedQuantity) => {
            const result = validate(
                { quantity: 1e12 },
                { approvedQuantity },
            );

            expect(result.valid).toBe(false);
            expect(result.reasons).toContain(
                "Risk decision does not contain a valid approved quantity.",
            );
        },
    );

    it("rejects orders that together exceed the approved quantity", () => {
        expect(validate({ quantity: 20 }, {}, 0).valid).toBe(true);
        expect(validate({ quantity: 1 }, {}, 20).valid).toBe(false);
        expect(validate({ quantity: 10 }, {}, 15).valid).toBe(false);
        expect(validate({ quantity: 5 }, {}, 15).valid).toBe(true);
    });

    it.each([NaN, -1, Infinity])(
        "rejects reserved quantity %d",
        (reservedQuantity) => {
            const result = validate({}, {}, reservedQuantity);

            expect(result.valid).toBe(false);
            expect(result.reasons).toContain(
                "Reserved quantity must be a non-negative finite number.",
            );
        },
    );
});

describe("malformed intents", () => {
    it.each([5, null, ""])(
        "rejects idempotency key %j without throwing",
        (idempotencyKey) => {
            const result = validate({ idempotencyKey });

            expect(result.valid).toBe(false);
            expect(result.reasons).toContain(
                "Order intent requires a non-empty idempotency key.",
            );
        },
    );

    it.each(["live", "LIVE; DROP"])(
        "rejects trading mode %j",
        (tradingMode) => {
            expect(
                validate({ tradingMode }, { tradingMode }).valid,
            ).toBe(false);
        },
    );

    it("refuses proxy inputs", () => {
        expect(() =>
            validateOrderIntent({
                orderIntent: new Proxy(orderIntent, {}),
                riskDecision,
                reservedQuantity: 0,
            }),
        ).toThrow();
    });
});
