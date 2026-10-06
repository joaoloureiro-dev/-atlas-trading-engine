# Atlas — Registo de Revisão de Segurança

Documento vivo. Cada revisão acrescenta uma secção e atualiza o estado dos achados.

## Revisão #1 — 2026-10-06 (até ao commit `a85897e`)

Âmbito: todo o repositório e histórico git (12 commits). Os achados de RLS foram
verificados aplicando a migração `20260929092503_init` num PostgreSQL local e
executando consultas como `atlas_app` e como superuser.

Sem segredos reais no histórico git. `.gitignore` cobre `.env*`, chaves e certificados.

### Achados

| ID | Severidade | Estado | Resumo |
|----|-----------|--------|--------|
| A-01 | Alta | Aberto | `portfolios` / `portfolio_positions` estão no schema sem migração nem RLS |
| A-02 | Alta | Aberto | Papel `atlas_app` e respetivos GRANTs não estão codificados; superuser ignora RLS |
| A-03 | Média | Aberto | `users`, `tenants`, `external_identities` sem RLS e acessíveis por `atlas_app` |
| A-04 | Média | Aberto | `prisma` exportado diretamente permite contornar `withTenantTransaction` |
| A-05 | Média | Aberto | `withTenantTransaction` não verifica a pertença do `userId` ao `tenantId` |
| A-06 | Média | Aberto | RLS só isola o tenant: um utilizador do tenant pode alterar papéis (escalada para OWNER) |
| A-07 | Média | Aberto | Postgres publicado em `0.0.0.0:5432` com palavra-passe por defeito `change_me` |
| A-08 | Média | Aberto | Contratos usam `number` para quantidades e preços; a BD usa `Decimal(36,18)` |
| A-09 | Baixa | Aberto | `sql/rls.sql` está desatualizado (`app.current_"tenantId"`) e diverge da migração |
| A-10 | Baixa | Aberto | `npm audit`: 4 vulnerabilidades altas na CLI `prisma` (dev; `mysql2`, `deepmerge-ts`) |
| A-11 | Baixa | Aberto | `.env.example` define `DATABASE_URL` duas vezes |
| A-12 | Info | Aberto | Sem CI, sem testes de isolamento entre tenants, sem `SECURITY.md` |

### Detalhe

**A-01 — Tabelas de portefólio sem migração nem RLS.**
O commit `a85897e` acrescentou `Portfolio` e `PortfolioPosition` a `schema.prisma`,
mas não há migração. Quando se gerar uma com `prisma migrate dev`, o Prisma **não**
gera `ENABLE/FORCE ROW LEVEL SECURITY` nem políticas: as posições financeiras
ficariam legíveis entre tenants.
Correção: na mesma migração, acrescentar à mão `ENABLE` + `FORCE ROW LEVEL SECURITY`
e a política `tenantId = current_setting('app.current_tenant_id', true)::uuid` para
as duas tabelas. Acrescentar um teste que falhe se alguma tabela com coluna `tenantId`
não tiver RLS forçado (consulta a `pg_class.relrowsecurity` / `relforcerowsecurity`).

**A-02 — Papel da aplicação não está codificado.**
O commit `83a720a` retirou os `GRANT` da migração e nada no repositório cria `atlas_app`.
Verificado: o superuser (o `POSTGRES_USER=atlas` da imagem Docker) vê todas as linhas
mesmo com `FORCE ROW LEVEL SECURITY`. Se alguém apontar `APP_DATABASE_URL` para o
utilizador `atlas`, o isolamento desaparece sem dar erro.
Correção: script versionado (por exemplo `sql/roles.sql` ou um init script do Docker)
que cria `atlas_app` com `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, que não
é dono das tabelas, e só com os GRANTs mínimos. Verificar no arranque da aplicação:
`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` e abortar
se algum for `true`.

**A-03 — Tabelas de identidade sem RLS.**
Verificado: `atlas_app`, sem contexto de tenant, lê todas as linhas de `tenants`
(e também de `users` e `external_identities`). Estas tabelas são globais por natureza,
mas a aplicação não deve ter acesso irrestrito a elas a partir de um caminho
com âmbito de tenant.
Correção: separar o acesso (papel/serviço de identidade próprio) ou acrescentar
políticas (por exemplo `tenants.id = current tenant`).

**A-04 — Cliente Prisma exportado.**
`packages/database/src/index.ts` reexporta `prisma`, por isso qualquer consumidor pode
fazer consultas fora de `withTenantTransaction`. Nas tabelas com RLS o resultado é
vazio (fail-closed, verificado), mas nas tabelas sem RLS (A-01 e A-03) o acesso é total.
Correção: não exportar `prisma`; expor só `withTenantTransaction` e repositórios explícitos.

**A-05 — Contexto de tenant não autorizado.**
`withTenantTransaction` valida o formato UUID de `tenantId`/`userId`, mas não verifica
se o utilizador pertence ao tenant. O `userId` nem chega a ser usado. Quem chamar com um
`tenantId` vindo do cliente obtém acesso a esse tenant.
Correção: a função deve receber um `AuthorizationContext` já resolvido (tipo opaco/brand,
emitido só pelo módulo de autorização), ou verificar a membership dentro da própria
transação antes de `operation(tx)`.

**A-06 — Escalada de papel dentro do tenant.**
Verificado: com o contexto do tenant A, `atlas_app` insere uma membership com
`role = 'OWNER'`. O RLS isola tenants, não papéis. Isto é esperado, mas implica que
**todas** as mutações de `tenant_memberships`, de `LIVE_TRADING_ENABLE` e de
`broker_connections` exigem verificação de permissão na aplicação, com registo de auditoria.
Correção: camada de autorização obrigatória; considerar um trigger que impeça remover
o último OWNER ou que alguém se promova a si próprio.

**A-07 — Postgres exposto na rede.**
`compose.yaml` publica `"5432:5432"`, ou seja, em todas as interfaces. Com a palavra-passe
de exemplo, qualquer máquina na mesma rede (Wi-Fi público, por exemplo) entra como superuser.
Correção: `"127.0.0.1:5432:5432"` e deixar `POSTGRES_PASSWORD` vazio no `.env.example`
(com `${POSTGRES_PASSWORD:?required}` no compose).

**A-08 — Precisão numérica.**
`quantity`, `limitPrice`, `approvedCapital`, `maxLoss`, etc. são `number` (IEEE-754).
Num sistema de trading, isto dá erros de arredondamento em limites de risco e tamanhos
de ordem (por exemplo `0.1 + 0.2 !== 0.3`), o que pode contornar um limite por pouco.
Correção: usar strings decimais ou um tipo `Decimal` nos contratos e validar
na fronteira (por exemplo com zod).

**A-09 — `sql/rls.sql` desatualizado.**
Usa `app.current_"tenantId"`, mas a aplicação define `app.current_tenant_id`. Verificado:
`current_setting('app.current_"tenantId"', true)` devolve sempre NULL, por isso,
se aplicado, bloqueia tudo (fail-closed, mas confuso). Também não cobre as novas tabelas.
Correção: remover o ficheiro ou gerá-lo a partir da migração (fonte única de verdade).

**A-10 — Dependências.**
As 4 vulnerabilidades altas vêm da CLI `prisma` (dependência de desenvolvimento) através
de `mysql2` (não usado: o projeto é PostgreSQL) e `deepmerge-ts`. O risco em runtime é
baixo, mas convém atualizar quando houver correção sem quebra.

**A-11 — `.env.example`.**
`DATABASE_URL` aparece vazio na linha 5 e preenchido na linha 23; o dotenv usa o
primeiro valor e o comportamento fica ambíguo. Remover a duplicação.

**A-12 — Processo.**
Falta: CI com `typecheck`, `npm audit`, secret scanning (gitleaks) e testes de integração
de RLS (um tenant não lê nem escreve dados de outro; sem contexto devolve 0 linhas;
o papel não é superuser nem tem BYPASSRLS). Falta também um `SECURITY.md`
(política de divulgação de vulnerabilidades).

### Pontos positivos

- `set_config(..., true)` (local à transação): o contexto não fica na ligação do pool.
- `FORCE ROW LEVEL SECURITY` nas tabelas com RLS, e o fail-closed sem contexto foi verificado.
- FKs compostas `(tenantId, id)` impedem relações entre tenants (broker account ↔
  connection, position ↔ portfolio).
- Credenciais de broker guardadas apenas como referência (`credentialReference`).
- TypeScript em modo estrito com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- `TRADING_MODE=paper` por omissão; `tradingMode` por omissão é `PAPER` na BD.

### Prioridades para as próximas features

1. Antes de gerar a migração de portefólios: A-01 e A-02.
2. Antes da primeira API/serviço: A-04, A-05, A-06.
3. Antes de integrar brokers ou ordens: A-08, auditoria imutável (append-only) de eventos,
   idempotência garantida na BD (`UNIQUE (tenantId, idempotencyKey)`), gestão de
   segredos (KMS/Vault) e separação de privilégios entre agentes e o executor.
