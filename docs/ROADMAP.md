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

## 4. Conectar o banco ao servidor
- [ ] `npm install pg dotenv`
- [ ] `.env` com `DATABASE_URL=postgres://postgres:SENHA@localhost:5432/personal_budget` e `.env.example` sem a senha
- [ ] `db/index.js` exportando um `Pool` (e uma função `query`)
- [ ] Reorganizar: `app.js` (Express) + `server.js` (listen) + `routes/` + middleware central de erros

## 5. Criar a tabela de envelopes
- [ ] `db/schema.sql` com `CREATE TABLE IF NOT EXISTS envelopes (...)`
- [ ] Rodar com `psql -U postgres -d personal_budget -f db/schema.sql`
- [ ] Conferir no psql: `\dt` e `\d envelopes`

## 6. Atualizar as requisições de envelopes
- [ ] GET/POST/PUT/DELETE `/envelopes` com `pool.query('SQL ... $1', [valor])`
- [ ] Transferência com `BEGIN` / `COMMIT` / `ROLLBACK` num client do pool
- [ ] Remover o `extract` do PUT (gasto vira transação na etapa 8)
- [ ] Remover `totalBudget` e a validação de orçamento global; `GET /` passa a mostrar só os totais alocado e disponível
- [ ] PUT do `budget` ajusta o `balance` pela diferença; transferência move `budget` e `balance`
- [ ] `budget >= 0` tanto no POST quanto no PUT; mapear snake_case (banco) ↔ camelCase (JSON) numa função central
- [ ] Tratar erros do Postgres (ex.: `23505` = título duplicado → 409; `23514` = violou CHECK → 400; `23503` = envelope com transações → 409)

## 7. Testar os endpoints (Postman)
- [ ] Retestar todas as rotas; conferir no psql que os dados persistem após reiniciar o servidor
- [ ] Conferir status codes e mensagens de erro

## 8. Criar a tabela de transações
- [ ] Adicionar `transactions` ao `schema.sql` com `REFERENCES envelopes(id)` e a regra de `ON DELETE` escolhida
- [ ] `\d transactions` para conferir a chave estrangeira

## 9. Endpoints de transações
- [ ] `POST /transactions` — cria e debita o envelope, numa transação SQL
- [ ] `GET /transactions`, `GET /transactions/:id`, `GET /envelopes/:id/transactions`
- [ ] `PUT /transactions/:id` — ajusta o saldo pela diferença (e lida com troca de envelope)
- [ ] `DELETE /transactions/:id` — devolve o valor ao envelope
- [ ] Validações: saldo insuficiente, envelope inexistente, valor/data inválidos

## 10. Testar as transações
- [ ] Criar 2 envelopes, várias transações, editar, apagar; conferir os saldos a cada passo
- [ ] Casos de erro: saldo insuficiente, envelope inexistente, apagar envelope com transações

## 11. Documentação Swagger
- [ ] `swagger-ui-express` + `docs/openapi.yaml` (OpenAPI 3)
- [ ] Schemas `Envelope`, `Transaction`, `Error`; exemplos de request/response; todos os status codes
- [ ] Rota `/api-docs`

## 12. Deploy no Render
- [ ] `"start": "node server.js"` e `"engines"` no `package.json`; push para o GitHub
- [ ] Criar Render Postgres (free: expira em 30 dias) e rodar o `schema.sql` nele com `psql` pela External URL
- [ ] Web Service ligado ao repo, com `DATABASE_URL` (Internal URL) nas env vars; SSL se necessário
- [ ] Testar a URL pública e `/api-docs`; atualizar o README

## 13. Próximos passos (opcional)
- [ ] Front-end simples (HTML/CSS/JS) ou React consumindo a API
- [ ] Tabela `transfers` para histórico de transferências (duas chaves estrangeiras para `envelopes`, `CHECK (from <> to)`)
