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
| A-01 | Alta | Resolvido (`be410f9`) | `portfolios` / `portfolio_positions` estão no schema sem migração nem RLS |
| A-02 | Alta | Aberto | Papel `atlas_app` e respetivos GRANTs não estão codificados; superuser ignora RLS |
| A-03 | Média | Aberto | `users`, `tenants`, `external_identities` sem RLS e acessíveis por `atlas_app` |
| A-04 | Média | Aberto | `prisma` exportado diretamente permite contornar `withTenantTransaction` |
| A-05 | Média | Aberto | `withTenantTransaction` não verifica a pertença do `userId` ao `tenantId` |
| A-06 | Média | Aberto | RLS só isola o tenant: um utilizador do tenant pode alterar papéis (escalada para OWNER) |
| A-07 | Média | Resolvido (revisão #3) | Postgres publicado em `0.0.0.0:5432` com palavra-passe por defeito `change_me` |
| A-08 | Média | Aberto | Contratos usam `number` para quantidades e preços; a BD usa `Decimal(36,18)` |
| A-09 | Baixa | Resolvido (revisão #3) | `sql/rls.sql` está desatualizado (`app.current_"tenantId"`) e diverge da migração |
| A-10 | Baixa | Resolvido (revisão #2) | `npm audit`: 4 vulnerabilidades altas na CLI `prisma` (dev; `mysql2`, `deepmerge-ts`) |
| A-11 | Baixa | Resolvido (revisão #3) | `.env.example` define `DATABASE_URL` duas vezes |
| A-12 | Info | Parcial (CI com build, typecheck, testes e audit; faltam testes de RLS e secret scanning) | Sem CI, sem testes de isolamento entre tenants, sem `SECURITY.md` |

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

## Revisão #2 — 2026-10-22 (até ao commit `f971068`)

Âmbito: os 13 commits novos (migração de portefólios, portfolio-engine, risk-engine,
execution-gateway). Achados confirmados com provas de conceito contra `evaluateHardRisk`
e aplicando as migrações num PostgreSQL temporário.

- A-01 resolvido: a migração `be410f9` cria RLS forçado em `portfolios` e
  `portfolio_positions`. Verificado: sem contexto não se vê nada, inserir no tenant B a
  partir do A é bloqueado, e associar uma posição a um portefólio de outro tenant falha
  pela FK composta.
- A-10 resolvido: `npm audit` sem vulnerabilidades.

### Achados

| ID | Severidade | Estado | Resumo |
|----|-----------|--------|--------|
| R-01 | Alta | Corrigido | Hard risk gate aprovava quando estado ou limites eram `NaN` (fail-open) |
| R-02 | Alta | Corrigido | Perda máxima por trade não limitada ao restante do limite diário |
| R-03 | Média | Resolvido (revisão #3) | Snapshot de concentração de outro portefólio era aceite; `TradeProposal` sem `portfolioId` |
| R-04 | Média | Resolvido (revisão #3) | Propostas expiradas aprovadas; `tradingMode` vem da proposta do agente |
| R-05 | Baixa | Aberto | `portfolio_positions` aceita `market` arbitrário e preços negativos (sem CHECK) |
| R-06 | Info | Revisto (revisão #3) | `execution-gateway` vazio; ainda não há nada para rever |

**R-01.** Todas as verificações tinham a forma "rejeita se `x >= limite`". Como qualquer
comparação com `NaN` dá `false`, um dado em falta (PnL, drawdown, exposição, limites ou
`maxOpenPositions`) fazia o trade passar.
Correção: validar estado e limites com `Number.isFinite` antes de qualquer comparação,
falhando de forma fechada (fail-closed).

**R-02.** Com o PnL do dia em −990 e um limite diário de 1000, era aprovado um trade com
`maxLoss` 500. Correção: o orçamento de risco passa a ser
`min(maxRiskPerTrade, maxDailyLoss + currentDailyPnl)`.
Pendente: o drawdown não tem a mesma limitação, porque o gate não recebe o equity/peak
necessário para converter percentagem em capital.

**R-03.** Corrigido: a concentração passa a ter de pertencer a `limits.portfolioId`.
Pendente: acrescentar `portfolioId` ao `TradeProposal`, verificar a idade do snapshot
(`calculatedAt`) e usar uma única fonte para a exposição bruta (hoje há
`currentGrossExposure` e `concentration.grossExposure`).

**R-04.** Corrigido: propostas expiradas ou com `expiresAt` inválido são rejeitadas.
Pendente: o `tradingMode` deve vir da configuração do portefólio ou da conta e não da
proposta do agente; um agente não deve poder pedir LIVE.

**R-05.** Tornar `market` um enum e acrescentar `CHECK` para preços não negativos.

Notas: as contas do gate continuam em `number` (A-08); com floats, o `maxLoss` pode
exceder o orçamento por um erro de arredondamento mínimo. O `execution-gateway` deve
aceitar apenas `RiskDecision` aprovadas, verificadas e idempotentes.

## Revisão #3 — 2026-10-24 (até ao commit `eae24ee`): equipa vermelha vs. azul

Âmbito: todo o repositório, incluindo a validação de ordens do `execution-gateway`.
A equipa vermelha atacou em várias camadas:
- Fuzzing da lógica de risco e execução: 200 mil entradas aleatórias e 500 mil casos
  de precisão.
- Isolamento entre tenants numa base de dados real, como `atlas_app`.
- Cadeia de fornecimento e CI.
A equipa azul corrigiu cada achado confirmado. Cada correção tem um teste que reproduz
o ataque (`adversarial-*.test.ts`). Desses 89 testes, 80 falham contra o código antigo
e todos passam contra o corrigido.

### Camadas sem achados

- **Isolamento entre tenants (RLS).** Leitura, escrita, inserção e apagamento entre
  tenants foram todos bloqueados. Contexto vazio, ausente ou malformado falha fechado.
  Não há fuga de contexto entre transações na mesma ligação. O `atlas_app` não consegue
  desativar o RLS nem mudar de papel. Até usar o `prisma` global dentro de uma transação
  de tenant falha fechado nas tabelas com RLS.
- **Cadeia de fornecimento.** Os pacotes vêm só do `registry.npmjs.org`, com hash de
  integridade. O CI não usa triggers nem expressões perigosas. O histórico git não tem
  segredos. O PR do Dependabot (vitest 5.0.5) é legítimo.

### Achados

| ID | Severidade | Estado | Resumo |
|----|-----------|--------|--------|
| X-01 | Crítica | Resolvido | Gateway aceitava ordem com direção, instrumento, preço ou tipo diferentes do aprovado |
| X-02 | Crítica | Resolvido | `approvedQuantity` `NaN`/`Infinity`/string anulava o limite de quantidade |
| X-03 | Crítica | Parcial | Decisões forjadas pelo chamador, reutilizadas ou divididas em várias ordens |
| X-04 | Alta | Resolvido | Ordem invertida após aprovação: exposição líquida 80 000 com limite 30 000 e sem stop |
| X-05 | Alta | Resolvido | O agente escolhia o modo de trading, incluindo LIVE |
| X-06 | Alta | Resolvido | Direção não validada (`"BUY"`, `"long"`), headroom líquido inflacionado 6× |
| X-07 | Alta | Resolvido | Mercado não validado (`"crypto"`, `"CRYPTO "`) contornava limites por mercado |
| X-08 | Média | Resolvido | Snapshot de concentração com mercados duplicados, total inconsistente ou desatualizado |
| X-09 | Média | Resolvido | Preço 0 escondia a exposição: exposição bruta real 59 000 com limite 50 000 |
| X-10 | Média | Aberto | Sem moeda nas posições: valores em USD e JPY somados sem conversão |
| X-11 | Média | Resolvido | Getters ou Proxies mudavam valores entre validação e uso |
| X-12 | Baixa | Resolvido | Arredondamento: `maxLoss` excedia o orçamento por ~1 ULP |
| X-13 | Baixa | Resolvido | Aprovação com quantidade 0 |
| X-14 | Baixa | Resolvido | Propostas válidas por séculos (`+275760-09-13`) |
| X-15 | Baixa | Resolvido | Portefólio vazio rejeitava sempre o primeiro trade |
| X-16 | Baixa | Resolvido | Gateway rebentava com `idempotencyKey` não string |
| X-17 | Baixa | Resolvido | Testes do gateway compilados para `dist/` e corridos duas vezes |
| X-18 | Baixa | Resolvido | Build limpa falhava porque o gateway compilava antes do `contracts` |
| X-19 | Média | Resolvido | Datas sem fuso eram lidas na hora local de cada serviço: validade dependia do fuso |
| X-20 | Média | Resolvido | Ordens STOP sem pior preço: slippage ilimitada depois do disparo |
| X-21 | Média | Resolvido | A slippage permitida podia levar a perda acima do `maxLoss` aprovado; slippage sem teto |
| X-22 | Média | Resolvido | Com a exposição líquida no limite, trades que a reduziam eram rejeitados |
| X-23 | Média | Resolvido | Trades acima do limite de concentração eram rejeitados em vez de reduzidos |
| X-24 | Baixa | Resolvido | Ordens de pó passavam sem fim depois de a decisão estar totalmente reservada |
| X-25 | Baixa | Resolvido | Entradas malformadas (`null`, BigInt, `Date`) rebentavam com TypeError |
| X-26 | Baixa | Resolvido | `baseAsset`/`quoteAsset` da ordem não eram comparados com os da decisão |

### Ronda 2

Uma nova equipa vermelha atacou as correções da ronda 1 e confirmou que o
dimensionamento é sólido: em 200 mil casos aleatórios, nenhuma aprovação excedeu
os limites, e o ciclo de arredondamento nunca precisou de mais de 2 iterações em
5 milhões de casos. Encontrou X-19 a X-26. Os testes da ronda 2 falham contra o
código da ronda 1 (20 de 25; os outros são casos de controlo) e passam contra o
código atual. As suítes foram corridas nos fusos UTC, America/Adak, Etc/GMT+12 e
Asia/Kolkata.

Mudanças de comportamento da ronda 2:
- Datas só em ISO-8601 com `Z` ou offset explícito (`parseTimestamp`). O
  `expiresAt` da decisão é guardado em UTC.
- Ordens STOP exigem `limitPrice` como pior preço, tal como as MARKET.
- Uma ordem não pode perder mais do que o `maxLoss` aprovado, nem usar mais do que
  o `approvedCapital`, a nenhum dos seus preços. Na quantidade total aprovada, isto
  significa entrar ao preço aprovado; a slippage só cabe em ordens mais pequenas.
  A slippage configurável tem um teto de 500 bps (`MAX_SLIPPAGE_BPS`).
- Um trade acima do limite de concentração é reduzido até caber e fica com o motivo
  "Position size was reduced to fit market concentration limits."
- Nota: num portefólio muito pequeno, um limite percentual de concentração continua
  a permitir trades muito pequenos, porque é relativo à exposição atual. Para mudar
  isto, o limite teria de ser relativo ao capital do portefólio.

### Notas

- **X-03.** O validador passa a exigir `reservedQuantity`, e a soma das ordens não pode
  exceder a quantidade aprovada. Isto fecha a reutilização e a divisão, desde que o
  chamador forneça o valor real. Falta:
  - Carregar a decisão pelo `riskDecisionId` a partir de um armazenamento de confiança,
    não aceitá-la do chamador.
  - Reservar a quantidade de forma atómica na BD (por exemplo, `UNIQUE` na idempotência
    e uma reserva por decisão).
  Ambos dependem da camada de persistência do gateway, que ainda não existe.
- **Ordens MARKET.** Passam a exigir `limitPrice` como pior preço aceitável. A banda por
  omissão é de 50 bps à volta da entrada aprovada (`DEFAULT_MAX_SLIPPAGE_BPS`).
- **Mudanças de API.**
  - `evaluateRisk` e `evaluateHardRisk` exigem `portfolio`.
  - `TradeProposal` exige `portfolioId`.
  - `RiskDecision` passa a incluir `portfolioId`, `instrument`, `direction`, `entryPrice`
    e `expiresAt`.
  - O snapshot de concentração não pode ter mais de 60 s
    (`MAX_SNAPSHOT_AGE_MS`).
  - Uma proposta não pode ser válida durante mais de 15 min (`MAX_PROPOSAL_TTL_MS`).
- **RLS com papel partilhado.** Um único papel `atlas_app` pode definir o contexto de
  qualquer tenant. O RLS protege contra erros da aplicação, mas não contra um processo
  comprometido. É uma limitação conhecida do modelo, registada em A-05.
- **Infraestrutura.**
  - O Postgres só escuta em `127.0.0.1` e o compose exige `POSTGRES_PASSWORD`.
  - O `.env.example` já não tem palavras-passe por omissão nem `DATABASE_URL` duplicado.
  - O `sql/rls.sql` partido foi removido; as migrações são a única fonte de RLS.
