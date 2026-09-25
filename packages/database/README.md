# @atlas/database

Database infrastructure for Atlas.

## Security model

Atlas is multi-tenant by design.

Tenant-scoped financial data must never be accessed without an explicit
tenant context.

Application authorization and PostgreSQL Row-Level Security are separate
layers of defense.

## Rules

- Never trust a tenant ID supplied by the client without authorization.
- Never perform tenant-scoped financial queries without tenant context.
- Never allow cross-tenant financial operations.
- Never store broker credentials in plaintext.
- Never expose broker secrets through normal database queries.
- Prefer fail-closed behavior when tenant context is missing or invalid.
- PostgreSQL RLS must protect tenant-scoped financial tables.

## Row-Level Security

Tenant-scoped tables are protected using PostgreSQL Row-Level Security.

The application must establish the tenant context inside the same database
transaction used to access tenant-scoped resources.

Tenant context must never be persisted globally on a pooled database
connection.

RLS is a defense-in-depth mechanism and does not replace application
authorization.

Cross-tenant relationships must also be protected by database constraints
where possible.