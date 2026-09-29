-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('PRIVY');
-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('BROKER', 'EXCHANGE');
-- CreateEnum
CREATE TYPE "BrokerConnectionStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'DEGRADED',
    'DISCONNECTED',
    'REVOKED'
);
-- CreateEnum
CREATE TYPE "BrokerAccountStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'DISABLED');
-- CreateEnum
CREATE TYPE "TradingMode" AS ENUM ('PAPER', 'SHADOW', 'LIVE');
-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "broker_connections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "type" "BrokerType" NOT NULL,
    "status" "BrokerConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "credentialReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "broker_connections_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "broker_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "brokerConnectionId" UUID NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "status" "BrokerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "tradingMode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "baseCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "broker_accounts_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");
-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
-- CreateIndex
CREATE INDEX "tenant_memberships_userId_idx" ON "tenant_memberships"("userId");
-- CreateIndex
CREATE INDEX "tenant_memberships_tenantId_role_idx" ON "tenant_memberships"("tenantId", "role");
-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenantId_userId_key" ON "tenant_memberships"("tenantId", "userId");
-- CreateIndex
CREATE INDEX "external_identities_userId_idx" ON "external_identities"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_providerUserId_key" ON "external_identities"("provider", "providerUserId");
-- CreateIndex
CREATE INDEX "broker_connections_tenantId_status_idx" ON "broker_connections"("tenantId", "status");
-- CreateIndex
CREATE INDEX "broker_connections_tenantId_provider_idx" ON "broker_connections"("tenantId", "provider");
-- CreateIndex
CREATE UNIQUE INDEX "broker_connections_tenantId_id_key" ON "broker_connections"("tenantId", "id");
-- CreateIndex
CREATE INDEX "broker_accounts_tenantId_status_idx" ON "broker_accounts"("tenantId", "status");
-- CreateIndex
CREATE INDEX "broker_accounts_tenantId_tradingMode_idx" ON "broker_accounts"("tenantId", "tradingMode");
-- CreateIndex
CREATE INDEX "broker_accounts_tenantId_brokerConnectionId_idx" ON "broker_accounts"("tenantId", "brokerConnectionId");
-- CreateIndex
CREATE UNIQUE INDEX "broker_accounts_brokerConnectionId_externalAccountId_key" ON "broker_accounts"("brokerConnectionId", "externalAccountId");
-- AddForeignKey
ALTER TABLE "tenant_memberships"
ADD CONSTRAINT "tenant_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "tenant_memberships"
ADD CONSTRAINT "tenant_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "external_identities"
ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "broker_connections"
ADD CONSTRAINT "broker_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "broker_accounts"
ADD CONSTRAINT "broker_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "broker_accounts"
ADD CONSTRAINT "broker_accounts_tenantId_brokerConnectionId_fkey" FOREIGN KEY ("tenantId", "brokerConnectionId") REFERENCES "broker_connections"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ============================================================
-- ATLAS ROW-LEVEL SECURITY
-- ============================================================
--
-- Tenant isolation is enforced at the database level in
-- addition to application-level authorization.
--
-- The application must set:
--
--   app.current_tenant_id
--
-- inside the database transaction before accessing
-- tenant-scoped data.
--
-- IMPORTANT:
-- RLS must be enabled and forced on every tenant-scoped
-- financial table.
-- ============================================================
-- ============================================================
-- TENANT MEMBERSHIPS
-- ============================================================
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships_isolation ON tenant_memberships USING (
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
-- ============================================================
-- BROKER CONNECTIONS
-- ============================================================
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_connections_isolation ON broker_connections USING (
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
-- ============================================================
-- BROKER ACCOUNTS
-- ============================================================
ALTER TABLE broker_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY broker_accounts_isolation ON broker_accounts USING (
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
