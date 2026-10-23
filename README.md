# Personal Budget API

API REST de orçamento pessoal pelo método de **envelopes**: cada categoria de gasto (Mercado, Lazer...) recebe um teto, e cada gasto registrado sai do saldo de um envelope.

Feita com **Node.js + Express 5** e **PostgreSQL** (driver `pg`, SQL escrito à mão, sem ORM), documentada com **OpenAPI** e publicada no **Render**.

- **API em produção:** https://personal-budget-api-rrm3.onrender.com
- **Documentação interativa (Swagger):** https://personal-budget-api-rrm3.onrender.com/api-docs

> **Primeiro acesso lento?** No plano gratuito do Render, a API "dorme" após 15 minutos sem uso. A primeira requisição depois disso leva cerca de 1 minuto; as seguintes são imediatas.

---

## O modelo

| Conceito | O que é |
| :--- | :--- |
| **Envelope** | Uma categoria com um **teto** (`budget`) e um **saldo disponível** (`balance`). |
| **Transação** | Um gasto que sai de um envelope: valor, destinatário e data. Reduz o saldo, não o teto. |
| **Transferência** | Realoca planejamento entre dois envelopes: move teto **e** saldo. |

Uma regra vale sempre, para todo envelope:

```
budget − balance = soma das transações do envelope
```

Toda operação que mexe com dinheiro preserva essa igualdade. O arquivo [`db/check-invariant.sql`](db/check-invariant.sql) confere isso direto no banco (resultado esperado: 0 linhas). O modelo completo e as decisões estão em [`docs/database.md`](docs/database.md).

---

## Decisões técnicas em destaque

- **Dinheiro nunca passa por float.** As colunas são `NUMERIC(12,2)`, a API devolve valores como string (`"500.00"`) e toda conta é feita pelo Postgres. Entradas com mais de 2 casas decimais são recusadas, em vez de arredondadas em silêncio.
- **Regras de negócio no banco.** Constraints nomeadas garantem saldo nunca negativo, títulos únicos sem diferenciar maiúsculas e valores positivos. "Saldo insuficiente" é o próprio `CHECK (balance >= 0)` recusando o `UPDATE`, o que funciona mesmo com requisições simultâneas: num teste com 20 gastos concorrentes de R$ 30 num envelope com R$ 200, exatamente 6 foram aceitos.
- **Transações SQL em toda operação que altera mais de uma linha** (`BEGIN`/`COMMIT`/`ROLLBACK`), com:
  - `SELECT ... FOR UPDATE` ao editar uma transação, para dois PUTs simultâneos não devolverem o mesmo valor duas vezes;
  - atualização dos envelopes sempre em ordem crescente de id, para evitar deadlock entre operações opostas.
- **Histórico protegido.** A chave estrangeira usa `ON DELETE RESTRICT`: um envelope com transações não pode ser apagado (409).
- **Datas sem armadilha de fuso.** `DATE` é devolvido como texto `AAAA-MM-DD`, e cada conexão do pool usa o fuso `America/Sao_Paulo`, inclusive no Render, que roda em UTC.
- **Erros centralizados.** Um único error handler traduz erros do Postgres pelo nome da constraint em mensagens em português, e nunca expõe detalhes internos (stack trace e SQL ficam só no log).
- **Documentação conferida.** A especificação OpenAPI é validada com Redocly, e cada mensagem de erro documentada foi comparada com as respostas reais da API.

---

## Rotas

| Método | Rota | Descrição | Sucesso |
| :--- | :--- | :--- | :--- |
| GET | `/` | Saúde da API e totais do orçamento | 200 |
| GET | `/envelopes` | Lista os envelopes | 200 |
| POST | `/envelopes` | Cria um envelope (saldo inicial = teto) | 201 |
| GET | `/envelopes/{id}` | Busca um envelope | 200 |
| PUT | `/envelopes/{id}` | Atualiza título e/ou teto (o saldo acompanha a diferença) | 200 |
| DELETE | `/envelopes/{id}` | Apaga um envelope sem transações | 204 |
| POST | `/envelopes/transfer/{from}/{to}` | Transfere teto e saldo entre envelopes | 200 |
| GET | `/envelopes/{id}/transactions` | Transações de um envelope | 200 |
| GET | `/transactions` | Lista as transações (mais recentes primeiro) | 200 |
| POST | `/transactions` | Registra um gasto e debita o envelope | 201 |
| GET | `/transactions/{id}` | Busca uma transação | 200 |
| PUT | `/transactions/{id}` | Edita valor, envelope, destinatário ou data, ajustando os saldos | 200 |
| DELETE | `/transactions/{id}` | Apaga um gasto e devolve o valor ao envelope | 204 |

Os status de erro (400, 404, 409, 422, 500), com exemplos das mensagens, estão na [documentação interativa](https://personal-budget-api-rrm3.onrender.com/api-docs) e em [`docs/openapi.yaml`](docs/openapi.yaml).

### Exemplo rápido (curl)

```bash
API=https://personal-budget-api-rrm3.onrender.com

# Criar um envelope
curl -X POST $API/envelopes -H "Content-Type: application/json" -d '{"title": "Mercado", "budget": 500}'

# Registrar um gasto nele (sem data = hoje)
curl -X POST $API/transactions -H "Content-Type: application/json" -d '{"envelopeId": 1, "amount": "45.90", "recipient": "Padaria"}'

# Conferir o saldo: balance = "454.10"
curl $API/envelopes/1
```

---

## Rodando localmente

**Pré-requisitos:** Node.js 24 e PostgreSQL (desenvolvido com o 18).

```bash
git clone https://github.com/lucas-fcs/personal-budget.git
cd personal-budget
npm install
```

**1. Criar o banco e um usuário dedicado** (a API não usa o superusuário `postgres`):

```bash
psql -U postgres -c "CREATE DATABASE personal_budget;"
psql -U postgres -d personal_budget -f db/create-role.sql
psql -U postgres -d personal_budget -c "\password budget_app"
```

**2. Configurar a conexão:** copie `.env.example` para `.env` e coloque a senha definida acima.

```bash
cp .env.example .env
```

**3. Criar as tabelas**, como `budget_app`, que fica dono delas:

```bash
psql -U budget_app -h localhost -d personal_budget -v ON_ERROR_STOP=1 --single-transaction -f db/schema.sql
```

**4. Subir o servidor:**

```bash
npm run dev
```

A API fica em http://localhost:3000 e a documentação em http://localhost:3000/api-docs.

Para testar no **Postman**, importe `http://localhost:3000/api-docs/openapi.yaml`. A coleção é gerada a partir da especificação; depois, ajuste a variável `baseUrl` para `http://localhost:3000`.

### Variáveis de ambiente

| Variável | Descrição | Padrão |
| :--- | :--- | :--- |
| `DATABASE_URL` | URL de conexão com o PostgreSQL (obrigatória) | — |
| `PORT` | Porta do servidor HTTP | `3000` |

O Node lê o `.env` nativamente (`--env-file-if-exists`), sem `dotenv`. O `.env` nunca vai para o Git.

---

## Estrutura do projeto

```
personal-budget/
├── app.js                  # monta o Express: middlewares, rotas, documentação e erros
├── server.js               # sobe o servidor (listen)
├── db/
│   ├── index.js            # Pool do pg, query() e withTransaction()
│   ├── schema.sql          # tabelas, constraints e índices (idempotente)
│   ├── create-role.sql     # usuário dedicado para o ambiente local
│   └── check-invariant.sql # auditoria: budget − balance = soma das transações
├── routes/
│   ├── envelopes.js
│   └── transactions.js
├── middleware/
│   └── errors.js           # HttpError, 404 e error handler central
├── utils/
│   ├── validation.js       # validação de ids, dinheiro, textos e datas
│   └── mappers.js          # banco (snake_case) → JSON (camelCase)
├── docs/
│   ├── openapi.yaml        # especificação OpenAPI 3.0.3
│   ├── database.md         # modelo de dados e decisões
│   └── ROADMAP.md          # plano do projeto, fase a fase
└── render.yaml             # infraestrutura de produção (Blueprint do Render)
```

---

## Deploy (Render)

A infraestrutura de produção está descrita em [`render.yaml`](render.yaml), um Blueprint do Render com a API e o PostgreSQL no plano gratuito, na região Virginia. Cada push na `main` dispara um novo deploy.

- A API recebe o `DATABASE_URL` diretamente do banco (`fromDatabase`), sem nenhum segredo copiado à mão, e usa a rede interna do Render.
- O banco **não aceita conexões externas** (`ipAllowList: []`). Para rodar SQL em produção, como o `schema.sql`, é preciso liberar temporariamente só o próprio IP.
- Limites do plano gratuito: a API dorme após 15 minutos sem uso, e o banco tem 1 GB, não tem backups e **expira 30 dias após a criação**. Com o Blueprint, recriar tudo leva poucos minutos.

---

## Licença

ISC
