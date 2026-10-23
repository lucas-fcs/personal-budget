# Roadmap — Personal Budget, Part II

Segue a ordem das tasks do enunciado. Marque `[x]` conforme avançar; cada etapa termina com teste no Postman e commit.
Stack: PostgreSQL + driver `pg` (Pool, SQL escrito à mão). Sem ORM.

## 1. Projetar o banco ✅
Decisões e diagrama em [`docs/database.md`](database.md).
- [x] Envelope vira tabela com `budget` (teto) e `balance` (saldo) separados. Transferência move os dois; editar `budget` ajusta `balance` pela diferença. Invariante: `budget − balance = soma das transações`.
- [x] `totalBudget` deixa de existir (a regra envolve várias linhas e não cabe num CHECK).
- [x] `nextId` e `findEnvelopeIndex` deixam de existir; ids com `GENERATED ALWAYS AS IDENTITY` (em vez de `SERIAL`).
- [x] Relação um-para-muitos; `envelope_id NOT NULL` e com índice (o Postgres não indexa chave estrangeira sozinho).
- [x] Apagar envelope com transações: `ON DELETE RESTRICT` (erro `23503` → 409).
- [x] Transferências só ajustam os envelopes, sem tabela própria (tabela `transfers` fica como opcional na etapa 13).
- [x] Diagrama em Mermaid, salvo em `docs/database.md`

Esboço final (a sintaxe exata fica para a etapa 5):
```
envelopes    (id INT IDENTITY PK, title TEXT NOT NULL UNIQUE em LOWER(title) e não vazio,
              budget NUMERIC(12,2) NOT NULL CHECK >= 0, balance NUMERIC(12,2) NOT NULL CHECK >= 0 AND <= budget)
transactions (id INT IDENTITY PK, envelope_id INT NOT NULL FK -> envelopes(id) ON DELETE RESTRICT (indexado),
              amount NUMERIC(12,2) NOT NULL CHECK > 0, recipient TEXT NOT NULL, spent_on DATE NOT NULL DEFAULT CURRENT_DATE)
```

## 2. Git ✅
- [x] Repositório já existe e tem remote no GitHub (não precisa de `git init`)
- [x] Criar branch `part-2` (`git switch -c part-2`)

## 3. Criar o banco com psql ✅
- [x] Instalar PostgreSQL no Windows (inclui o `psql`): versão 18.4 já instalada, serviço `postgresql-x64-18` na porta 5432
- [x] `psql -U postgres` → `CREATE DATABASE personal_budget;` → `\l` para conferir (codificação UTF8)

## 4. Conectar o banco ao servidor ✅
- [x] 4a. Usuário dedicado `budget_app`, dono do banco (`db/create-role.sql`), em vez de conectar como `postgres`
- [x] 4a. `.env` com `DATABASE_URL=postgres://budget_app:SENHA@localhost:5432/personal_budget` e `.env.example` sem a senha
- [x] 4b. `npm install pg` (sem `dotenv`: o Node 24 lê o `.env` com `--env-file-if-exists`); scripts `dev`/`start` e `engines`; corrigir `main`
- [x] 4b. `db/index.js` exportando `query` e `withTransaction` (e `pool.on('error')`, checagem da `DATABASE_URL` no boot)
- [x] 4c. Reorganizar: `app.js` (Express) + `server.js` (listen) + `routes/` + `middleware/errors.js` (refatoração pura, rotas ainda em memória)

## 5. Criar a tabela de envelopes ✅
- [x] `db/schema.sql` com `CREATE TABLE IF NOT EXISTS envelopes (...)`, constraints com nome e índice único em `LOWER(title)`
- [x] Rodar como `budget_app` (dono do banco): `psql -U budget_app -h localhost -d personal_budget -v ON_ERROR_STOP=1 --single-transaction -f db/schema.sql`
- [x] Conferir no psql: `\dt` e `\d envelopes` (dono `budget_app`, 5 CHECKs, índice único)

## 6. Atualizar as requisições de envelopes ✅
- [x] GET/POST/PUT/DELETE `/envelopes` com `pool.query('SQL ... $1', [valor])` (validação de formato em `utils/validation.js`)
- [x] Transferência com `BEGIN` / `COMMIT` / `ROLLBACK` num client do pool (`withTransaction`, UPDATEs em ordem de id para evitar deadlock)
- [x] Remover o `extract` do PUT (gasto vira transação na etapa 8)
- [x] Remover `totalBudget` e a validação de orçamento global; `GET /` passa a mostrar só os totais alocado e disponível
- [x] PUT do `budget` ajusta o `balance` pela diferença; transferência move `budget` e `balance`
- [x] Recusar valores com mais de 2 casas decimais (o `NUMERIC(12,2)` arredondaria em silêncio: 10.005 → 10.01)
- [x] `budget >= 0` tanto no POST quanto no PUT
- [ ] Mapear snake_case (banco) ↔ camelCase (JSON) numa função central → adiado para a etapa 9 (as colunas de `envelopes` têm uma palavra só)
- [x] Tratar erros do Postgres (ex.: `23505` = título duplicado → 409; `23514` = violou CHECK → 400, com mensagem por `err.constraint` (ex.: `envelopes_balance_non_negative` = saldo insuficiente); `23503` = envelope com transações → 409, entra na etapa 8)

## 7. Testar os endpoints (Postman) ✅
- [x] Retestar todas as rotas; conferir no psql que os dados persistem após reiniciar o servidor
- [x] Conferir status codes e mensagens de erro

## 8. Criar a tabela de transações ✅
- [x] Adicionar `transactions` ao `schema.sql` com `REFERENCES envelopes(id)` e a regra de `ON DELETE` escolhida (`ON DELETE RESTRICT`, constraints nomeadas, índice em `envelope_id`)
- [x] `\d transactions` para conferir a chave estrangeira
- [x] `DATE` devolvido como texto `YYYY-MM-DD` e fuso `America/Sao_Paulo` no Pool; auditoria do invariante em `db/check-invariant.sql`

## 9. Endpoints de transações ✅
- [x] 9b. `POST /transactions` — cria e debita o envelope, numa transação SQL (debita antes de inserir; envelope inexistente → 422)
- [x] 9a. `GET /transactions`, `GET /transactions/:id`, `GET /envelopes/:id/transactions` (mais recentes primeiro; JSON em camelCase via `utils/mappers.js`)
- [x] 9c. `PUT /transactions/:id` — ajusta o saldo pela diferença (e lida com troca de envelope) (mapa de ajustes por envelope, `FOR UPDATE` na transação, envelopes em ordem de id)
- [x] 9b. `DELETE /transactions/:id` — devolve o valor ao envelope
- [x] Validações: saldo insuficiente, envelope inexistente, valor/data inválidos

## 10. Testar as transações ✅
- [x] Criar 2 envelopes, várias transações, editar, apagar; conferir os saldos a cada passo (com `db/check-invariant.sql` após cada passo, inclusive após uma transferência)
- [x] Casos de erro: saldo insuficiente, envelope inexistente, apagar envelope com transações
- [x] Concorrência: POSTs, PUTs e DELETEs simultâneos sem deadlock e com a auditoria em 0 (etapa 9)

## 11. Documentação Swagger ✅
- [x] 11a. `swagger-ui-express` + `docs/openapi.yaml` (OpenAPI 3.0.3; o Swagger UI lê o YAML no navegador, sem parser no servidor)
- [x] 11b/11c. Schemas `Envelope`, `Transaction`, `Error`; exemplos de request/response; todos os status codes (as 26 mensagens de erro conferidas contra a API, nos dois sentidos)
- [x] 11a. Rota `/api-docs` (e `/api-docs/openapi.yaml` para importar no Postman)
- [x] Lint sem erros: `npx @redocly/cli lint docs/openapi.yaml` (3 avisos aceitos: listagens sem resposta 4xx)
- [x] Importável no Postman: `http://localhost:3000/api-docs/openapi.yaml` gera a coleção (ajustar a variável `baseUrl` para `http://localhost:3000`)

## 12. Deploy no Render ✅
- [x] 12a. `render.yaml` (Blueprint: API + Postgres free em `virginia`, `DATABASE_URL` ligada pelo `fromDatabase`); `engines` fixado em `24.x`; build com `npm ci`
- [x] 12b. PR `part-2 → main` (lucas-fcs/personal-budget#1) e merge; Blueprint criado no Render (URL: https://personal-budget-api-rrm3.onrender.com)
- [x] 12c. `schema.sql` aplicado em produção pela URL externa (lida de `/dev/clipboard`, nunca gravada em arquivo); `budget_app_v2` recebeu `GRANT ALL` nas tabelas
- [x] 12c. **Senha exposta do `budget_app`:** rotacionada para `budget_app_v2` (a API já usa a nova) e senha do `budget_app` trocada por uma aleatória. Como a porta externa do Render continuou aceitando a credencial antiga mesmo assim, o acesso externo foi fechado com `ipAllowList: []`: agora nenhuma credencial entra de fora do Render (verificado). Ao reabrir para manutenção, liberar só o próprio IP (`/32`) e fechar de novo
- [ ] 12c. As tabelas pertencem ao `budget_app`: mudanças futuras de estrutura (`ALTER TABLE`) exigirão transferir a posse para o `budget_app_v2`
- [x] 12d. URL pública e `/api-docs` testados; roteiro da etapa 10 rodado contra a produção (invariante ok em todos os passos) e dados de teste apagados pela própria API
- [x] 12e. README reescrito (Parte II, decisões técnicas, como rodar, deploy e limites do plano free); `x-powered-by` desativado

## 13. Próximos passos (opcional)
- [ ] Front-end simples (HTML/CSS/JS) ou React consumindo a API
- [ ] Tabela `transfers` para histórico de transferências (duas chaves estrangeiras para `envelopes`, `CHECK (from <> to)`)
- [ ] Paginação em `GET /transactions` (`LIMIT`/`OFFSET` ou cursor) se o volume crescer
