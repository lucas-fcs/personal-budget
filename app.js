const path = require('node:path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const db = require('./db');
const envelopesRouter = require('./routes/envelopes');
const transactionsRouter = require('./routes/transactions');
const { notFound, errorHandler } = require('./middleware/errors');

// Este arquivo só monta o app (middlewares, rotas, tratamento de erros) e o exporta.
// Quem abre a porta é o server.js; assim testes podem importar o app sem subir um servidor.
const app = express();

// Middleware para parsing de JSON
app.use(express.json());

// No Express 5, req.body fica undefined quando a requisição não tem corpo JSON;
// sem isto, ler req.body.title lançaria TypeError (erro 500) em vez de um 400 de validação.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

// Rota de Health Check e Resumo Orçamentário
app.get('/', async (req, res) => {
  // COUNT devolve bigint (o pg o entregaria como string), por isso o ::int.
  // SUM de zero linhas é NULL; o COALESCE troca por 0 e o ::numeric(14,2) padroniza "0.00".
  const { rows } = await db.query(
    `SELECT COUNT(*)::int                             AS "envelopesCount",
            COALESCE(SUM(budget), 0)::numeric(14, 2)  AS "totalBudget",
            COALESCE(SUM(balance), 0)::numeric(14, 2) AS "totalBalance"
     FROM envelopes`
  );
  res.status(200).json({ message: 'API Personal Budget ativa.', ...rows[0] });
});

app.use('/envelopes', envelopesRouter);
app.use('/transactions', transactionsRouter);

// Documentação OpenAPI. O arquivo cru (para importar no Postman) vem ANTES da página, que também
// responde sob /api-docs. O próprio Swagger UI busca o YAML por esta rota e o interpreta no navegador:
// o servidor não precisa de um parser de YAML, e editar o arquivo aparece ao recarregar a página.
const openapiPath = path.join(__dirname, 'docs', 'openapi.yaml');
app.get('/api-docs/openapi.yaml', (req, res) => {
  res.type('application/yaml').sendFile(openapiPath);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
  customSiteTitle: 'Personal Budget API — Documentação',
  swaggerOptions: { url: '/api-docs/openapi.yaml' }
}));

// A ordem importa: o 404 vem depois de todas as rotas, e o error handler é sempre o último.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
