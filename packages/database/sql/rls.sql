-- ============================================================
-- ATLAS ROW-LEVEL SECURITY
-- ============================================================
--
-- Tenant isolation is enforced at the database level in
-- addition to application-level authorization.
--
-- The application must set:
--
--   app.current_"tenantId"
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
        current_setting('app.current_"tenantId"', true),
        ''
    )::uuid
) WITH CHECK (
    "tenantId" = NULLIF(
        current_setting('app.current_"tenantId"', true),
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
        current_setting('app.current_"tenantId"', true),
        ''
    )::uuid
) WITH CHECK (
    "tenantId" = NULLIF(
        current_setting('app.current_"tenantId"', true),
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
        current_setting('app.current_"tenantId"', true),
        ''
    )::uuid
) WITH CHECK (
    "tenantId" = NULLIF(
        current_setting('app.current_"tenantId"', true),
        ''
    )::uuid
);
