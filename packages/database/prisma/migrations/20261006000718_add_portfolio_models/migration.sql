-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "tradingMode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "portfolio_positions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(36, 18) NOT NULL,
    "averageEntryPrice" DECIMAL(36, 18) NOT NULL,
    "currentPrice" DECIMAL(36, 18),
    "unrealizedPnl" DECIMAL(36, 18),
    "realizedPnl" DECIMAL(36, 18) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portfolio_positions_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "portfolios_tenantId_tradingMode_idx" ON "portfolios"("tenantId", "tradingMode");
-- CreateIndex
CREATE INDEX "portfolios_tenantId_name_idx" ON "portfolios"("tenantId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "portfolios_tenantId_id_key" ON "portfolios"("tenantId", "id");
-- CreateIndex
CREATE INDEX "portfolio_positions_tenantId_portfolioId_idx" ON "portfolio_positions"("tenantId", "portfolioId");
-- CreateIndex
CREATE INDEX "portfolio_positions_tenantId_market_idx" ON "portfolio_positions"("tenantId", "market");
-- CreateIndex
CREATE INDEX "portfolio_positions_tenantId_symbol_idx" ON "portfolio_positions"("tenantId", "symbol");
-- AddForeignKey
ALTER TABLE "portfolios"
ADD CONSTRAINT "portfolios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "portfolio_positions"
ADD CONSTRAINT "portfolio_positions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "portfolio_positions"
ADD CONSTRAINT "portfolio_positions_tenantId_portfolioId_fkey" FOREIGN KEY ("tenantId", "portfolioId") REFERENCES "portfolios"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ============================================================
-- PORTFOLIO ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE "portfolios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portfolios_isolation" ON "portfolios" USING (
    "tenantId" = NULLIF(
        current_setting('app.current_tenant_id', true),
        ''
    )::uuid
) WITH CHECK (
    "tenantId" = NULLIF(
        current_setting('app.current_tenant_id', true),
        ''
    )::uuid
);
ALTER TABLE "portfolio_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolio_positions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_positions_isolation" ON "portfolio_positions" USING (
    "tenantId" = NULLIF(
        current_setting('app.current_tenant_id', true),
        ''
    )::uuid
) WITH CHECK (
    "tenantId" = NULLIF(
        current_setting('app.current_tenant_id', true),
        ''
    )::uuid
);