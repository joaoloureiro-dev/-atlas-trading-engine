import { describe, expect, it } from "vitest";

import type {
    Portfolio,
    PortfolioConcentration,
    RiskLimits,
    TradeProposal,
} from "@atlas/contracts";

import { evaluateHardRisk } from "./hard-risk-gate.js";
import {
    evaluateRisk,
    MAX_PROPOSAL_TTL_MS,
} from "./evaluate-risk.js";
import { MAX_SNAPSHOT_AGE_MS } from "./evaluate-concentration.js";

// Regression tests for inputs a buggy or hostile proposal source can send.

const now = () => new Date().toISOString();

const proposal: TradeProposal = {
    id: "proposal-1",
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    agent: "CRYPTO",
    instrument: {
        symbol: "BTC-USD",
        market: "CRYPTO",
    },
    direction: "LONG",
    tradingMode: "PAPER",
    strategy: "test-strategy",
    modelVersion: "v1",
    confidence: 0.9,
    expectedEdge: 0.05,
    volatility: 0.2,
    liquidityScore: 0.9,
    newsImpactScore: 0.1,
    patternConfidence: 0.8,
    suggestedEntry: 100,
    invalidationPrice: 95,
    expectedHoldingTimeMs: 60_000,
    rationale: ["Test proposal"],
    createdAt: now(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const portfolio: Portfolio = {
    id: "portfolio-1",
    tenantId: "tenant-1",
    name: "Test portfolio",
    baseCurrency: "USD",
    tradingMode: "PAPER",
    createdAt: now(),
    updatedAt: now(),
};

const limits: RiskLimits = {
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    maxPositionNotional: 1_000_000,
    maxRiskPerTrade: 1_000_000,
    maxGrossExposure: 1_000_000,
    maxNetExposure: 30_000,
    maxDailyLoss: 1_000_000,
    maxDrawdownPercentage: 50,
    maxMarketConcentrationPercentage: 100,
    createdAt: now(),
    updatedAt: now(),
};

const concentration: PortfolioConcentration = {
    tenantId: "tenant-1",
    portfolioId: "portfolio-1",
    grossExposure: 25_000,
    markets: [
        {
            market: "STOCKS",
            exposure: 25_000,
            percentageOfGrossExposure: 100,
        },
    ],
    calculatedAt: now(),
};

const state = {
    currentGrossExposure: 25_000,
    currentNetExposure: 0,
    currentDailyPnl: 0,
    currentDrawdownPercentage: 0,
    currentOpenPositions: 0,
};

const hardRisk = (
    overrides: Partial<Parameters<typeof evaluateHardRisk>[0]>,
) =>
    evaluateHardRisk({
        decisionId: "decision-1",
        proposal,
        limits,
        portfolio,
        concentration,
        ...state,
        ...overrides,
    });

describe("trading mode", () => {
    it("rejects a proposal asking for a different mode than the portfolio", () => {
        const result = hardRisk({
            proposal: { ...proposal, tradingMode: "LIVE" },
        });

        expect(result.status).toBe("REJECTED");
        expect(result.tradingMode).toBe("PAPER");
    });

    it("rejects an unknown portfolio trading mode", () => {
        const result = hardRisk({
            proposal: { ...proposal, tradingMode: "live; DROP" as never },
            portfolio: { ...portfolio, tradingMode: "live; DROP" as never },
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Portfolio trading mode is invalid.",
        );
    });

    it("takes the decision trading mode from the portfolio", () => {
        const result = hardRisk({
            proposal: { ...proposal, tradingMode: "LIVE" },
            portfolio: { ...portfolio, tradingMode: "LIVE" },
        });

        expect(result.status).toBe("APPROVED");
        expect(result.tradingMode).toBe("LIVE");
    });
});

describe("direction and instrument", () => {
    it.each(["BUY", "long", "SELL", ""])(
        "rejects direction %j",
        (direction) => {
            const result = hardRisk({
                proposal: {
                    ...proposal,
                    direction: direction as never,
                },
                ...state,
                currentNetExposure: 25_000,
            });

            expect(result.status).toBe("REJECTED");
            expect(result.reasons).toContain(
                "Trade direction must be LONG or SHORT.",
            );
        },
    );

    it.each(["crypto", "CRYPTO ", "__proto__", ""])(
        "rejects market %j",
        (market) => {
            const result = hardRisk({
                proposal: {
                    ...proposal,
                    instrument: {
                        symbol: "BTC-USD",
                        market: market as never,
                    },
                },
            });

            expect(result.status).toBe("REJECTED");
            expect(result.reasons).toContain(
                "Trade instrument is invalid.",
            );
        },
    );

    it.each(["", " BTC-USD", "BTC-USD "])(
        "rejects symbol %j",
        (symbol) => {
            const result = hardRisk({
                proposal: {
                    ...proposal,
                    instrument: { symbol, market: "CRYPTO" },
                },
            });

            expect(result.status).toBe("REJECTED");
        },
    );

    it("records what was approved on the decision", () => {
        const result = hardRisk({});

        expect(result.status).toBe("APPROVED");
        expect(result.portfolioId).toBe("portfolio-1");
        expect(result.direction).toBe("LONG");
        expect(result.instrument).toEqual(proposal.instrument);
        expect(result.entryPrice).toBe(100);
        expect(result.expiresAt).toBe(proposal.expiresAt);
    });
});

describe("portfolio binding", () => {
    it("throws for a proposal from another portfolio", () => {
        expect(() =>
            hardRisk({
                proposal: { ...proposal, portfolioId: "portfolio-2" },
            }),
        ).toThrow(
            "Risk evaluation received a proposal for another portfolio.",
        );
    });

    it("throws when limits belong to another portfolio", () => {
        expect(() =>
            hardRisk({
                portfolio: { ...portfolio, id: "portfolio-2" },
            }),
        ).toThrow(
            "Risk limits do not belong to the supplied portfolio.",
        );
    });
});

describe("proposal lifetime", () => {
    it("rejects a validity window longer than the maximum", () => {
        const result = hardRisk({
            proposal: {
                ...proposal,
                expiresAt: new Date(
                    Date.now() + MAX_PROPOSAL_TTL_MS + 60_000,
                ).toISOString(),
            },
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Trade proposal validity window is invalid or too long.",
        );
    });

    it.each([
        "+275760-09-13T00:00:00Z",
        "2100-01-01T00:00:00Z",
    ])("rejects far future expiry %s", (expiresAt) => {
        const result = hardRisk({
            proposal: { ...proposal, expiresAt },
        });

        expect(result.status).toBe("REJECTED");
    });

    it("rejects a proposal created in the future", () => {
        const result = hardRisk({
            proposal: {
                ...proposal,
                createdAt: new Date(Date.now() + 60_000).toISOString(),
                expiresAt: new Date(Date.now() + 120_000).toISOString(),
            },
        });

        expect(result.status).toBe("REJECTED");
    });
});

describe("concentration snapshot", () => {
    const tightLimits: RiskLimits = {
        ...limits,
        maxMarketConcentrationPercentage: 30,
    };

    const crypto19k: PortfolioConcentration = {
        ...concentration,
        grossExposure: 20_000,
        markets: [
            {
                market: "CRYPTO",
                exposure: 19_000,
                percentageOfGrossExposure: 95,
            },
            {
                market: "STOCKS",
                exposure: 1_000,
                percentageOfGrossExposure: 5,
            },
        ],
    };

    const crypto19kState = {
        ...state,
        currentGrossExposure: 20_000,
    };

    it("rejects the over-concentrated control case", () => {
        const result = hardRisk({
            limits: tightLimits,
            concentration: crypto19k,
            ...crypto19kState,
        });

        expect(result.status).toBe("REJECTED");
    });

    it("rejects duplicate markets", () => {
        const result = hardRisk({
            limits: tightLimits,
            concentration: {
                ...crypto19k,
                markets: [
                    {
                        market: "CRYPTO",
                        exposure: 0,
                        percentageOfGrossExposure: 0,
                    },
                    ...crypto19k.markets,
                ],
            },
            ...crypto19kState,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Concentration snapshot markets must be valid and unique.",
        );
    });

    it("rejects a gross exposure that does not match the markets", () => {
        const result = hardRisk({
            limits: tightLimits,
            concentration: {
                ...crypto19k,
                grossExposure: 1e9,
            },
            ...crypto19kState,
            currentGrossExposure: 1e9,
        });

        expect(result.status).toBe("REJECTED");
    });

    it("rejects a snapshot that disagrees with the current gross exposure", () => {
        const result = hardRisk({
            concentration: crypto19k,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Concentration snapshot does not match the current gross exposure.",
        );
    });

    it("rejects a stale snapshot", () => {
        const result = hardRisk({
            concentration: {
                ...concentration,
                calculatedAt: new Date(
                    Date.now() - MAX_SNAPSHOT_AGE_MS - 1_000,
                ).toISOString(),
            },
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain(
            "Concentration snapshot is missing a valid recent timestamp.",
        );
    });

    it("rejects a snapshot without a timestamp", () => {
        const result = hardRisk({
            concentration: {
                ...concentration,
                calculatedAt: "",
            },
        });

        expect(result.status).toBe("REJECTED");
    });

    it("allows the first trade of an empty portfolio", () => {
        const result = hardRisk({
            limits: tightLimits,
            concentration: {
                ...concentration,
                grossExposure: 0,
                markets: [],
            },
            ...state,
            currentGrossExposure: 0,
        });

        expect(result.status).toBe("APPROVED");
    });

    it("still applies absolute market limits to an empty portfolio", () => {
        const result = hardRisk({
            limits: {
                ...limits,
                marketLimits: {
                    CRYPTO: {
                        maxExposure: 1,
                        maxConcentrationPercentage: 100,
                    },
                },
            },
            concentration: {
                ...concentration,
                grossExposure: 0,
                markets: [],
            },
            ...state,
            currentGrossExposure: 0,
        });

        expect(result.status).toBe("APPROVED");
        expect(result.approvedCapital).toBeLessThanOrEqual(1);
    });
});

describe("input integrity", () => {
    it("reads each proposal value once", () => {
        let reads = 0;

        const shifting = {
            ...proposal,
            get invalidationPrice() {
                reads += 1;
                return reads <= 1 ? 99.99 : 1;
            },
        };

        const result = evaluateRisk({
            decisionId: "decision-1",
            proposal: shifting,
            limits: { ...limits, maxRiskPerTrade: 100 },
            portfolio,
            ...state,
        });

        expect(result.stopLossPrice).toBe(99.99);
        expect(result.maxLoss).toBeLessThanOrEqual(100);
    });

    it("refuses proxy inputs", () => {
        const proxied = new Proxy(proposal, {});

        expect(() =>
            evaluateRisk({
                decisionId: "decision-1",
                proposal: proxied,
                limits,
                portfolio,
                ...state,
            }),
        ).toThrow();
    });
});

describe("sizing", () => {
    it.each([
        [729.7454, 711.25, 915.6],
        [85909.18783373627, 198.8679886790309, 100],
    ])(
        "keeps max loss within budget for entry %d, stop %d, budget %d",
        (entry, stop, budget) => {
            const result = evaluateRisk({
                decisionId: "decision-1",
                proposal: {
                    ...proposal,
                    suggestedEntry: entry,
                    invalidationPrice: stop,
                },
                limits: { ...limits, maxRiskPerTrade: budget },
                portfolio,
                ...state,
            });

            expect(result.status).toBe("APPROVED");
            expect(result.maxLoss).toBeLessThanOrEqual(budget);
        },
    );

    it("keeps max loss within budget across random inputs", () => {
        let seed = 42;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };

        for (let i = 0; i < 20_000; i++) {
            const entry = 1 + random() * 100_000;
            const stop = entry * (0.5 + random() * 0.49);
            const budget = 1 + random() * 10_000;
            const cap = 1 + random() * 1_000_000;

            const result = evaluateRisk({
                decisionId: "decision-1",
                proposal: {
                    ...proposal,
                    suggestedEntry: entry,
                    invalidationPrice: stop,
                },
                limits: {
                    ...limits,
                    maxRiskPerTrade: budget,
                    maxPositionNotional: cap,
                },
                portfolio,
                ...state,
            });

            if (result.status === "APPROVED") {
                expect(result.maxLoss).toBeLessThanOrEqual(budget);
                expect(result.approvedCapital).toBeLessThanOrEqual(cap);
            }
        }
    });

    it("rejects a trade too small to execute", () => {
        const result = evaluateRisk({
            decisionId: "decision-1",
            proposal,
            limits: { ...limits, maxNetExposure: 5e-324 },
            portfolio,
            ...state,
        });

        expect(result.status).toBe("REJECTED");
    });
});

describe("round 2", () => {
    it.each([
        "2099-01-01T00:00:00",
        "2099-01-01",
        "Tue Jan 01 2099",
    ])("rejects expiry %j without an explicit UTC offset", (expiresAt) => {
        const result = hardRisk({
            proposal: { ...proposal, expiresAt },
        });

        expect(result.status).toBe("REJECTED");
    });

    it("rejects a Date object instead of a timestamp string", () => {
        const result = hardRisk({
            proposal: {
                ...proposal,
                expiresAt: new Date(Date.now() + 60_000) as never,
            },
        });

        expect(result.status).toBe("REJECTED");
    });

    it("stores the decision expiry normalized to UTC", () => {
        const expiresAt = new Date(Date.now() + 60_000);
        const withOffset = new Date(
            expiresAt.getTime() + 2 * 3_600_000,
        )
            .toISOString()
            .replace("Z", "+02:00");

        const result = hardRisk({
            proposal: { ...proposal, expiresAt: withOffset },
        });

        expect(result.status).toBe("APPROVED");
        expect(result.expiresAt).toBe(expiresAt.toISOString());
    });

    it("allows a trade that reduces net exposure at its limit", () => {
        const result = hardRisk({
            proposal: {
                ...proposal,
                direction: "SHORT",
                invalidationPrice: 105,
            },
            ...state,
            currentNetExposure: limits.maxNetExposure,
        });

        expect(result.status).toBe("APPROVED");
    });

    it("still rejects a trade that adds to net exposure at its limit", () => {
        const result = hardRisk({
            ...state,
            currentNetExposure: limits.maxNetExposure,
        });

        expect(result.status).toBe("REJECTED");
        expect(result.reasons).toContain("Maximum net exposure reached.");
    });

    it("sizes a trade down to the concentration limit", () => {
        const result = hardRisk({
            limits: {
                ...limits,
                maxPositionNotional: 10_000,
                maxMarketConcentrationPercentage: 50,
            },
            concentration: {
                ...concentration,
                grossExposure: 1_000,
                markets: [
                    {
                        market: "STOCKS",
                        exposure: 1_000,
                        percentageOfGrossExposure: 100,
                    },
                ],
            },
            ...state,
            currentGrossExposure: 1_000,
        });

        expect(result.status).toBe("APPROVED");
        expect(result.approvedCapital).toBeLessThanOrEqual(1_000);
        expect(result.approvedCapital).toBeGreaterThan(999.99);
    });

    it.each([
        ["instrument null", { proposal: { ...proposal, instrument: null as never } }],
        ["concentration missing", { concentration: undefined as never }],
        [
            "markets missing",
            { concentration: { ...concentration, markets: undefined as never } },
        ],
        [
            "market entry null",
            { concentration: { ...concentration, markets: [null as never] } },
        ],
    ])("rejects malformed input: %s", (_name, overrides) => {
        const result = hardRisk(overrides);

        expect(result.status).toBe("REJECTED");
    });
});
