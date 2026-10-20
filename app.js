const express = require('express');
const db = require('./db');
const store = require('./data/memoryStore');
const envelopesRouter = require('./routes/envelopes');
const { notFound, errorHandler } = require('./middleware/errors');

// Este arquivo só monta o app (middlewares, rotas, tratamento de erros) e o exporta.
// Quem abre a porta é o server.js; assim testes podem importar o app sem subir um servidor.
const app = express();

// Middleware para parsing de JSON
app.use(express.json());

// Rota de Health Check e Resumo Orçamentário
app.get('/', async (req, res) => {
  // Prova de conexão com o banco (passo 4b); o resumo abaixo ainda vem da memória até a etapa 6.
  const { rows } = await db.query('SELECT NOW() AS now');
  const allocatedBudget = store.envelopes.reduce((acc, env) => acc + env.budget, 0);
  res.status(200).json({
    message: 'API Personal Budget ativa.',
    databaseTime: rows[0].now,
    totalBudget: store.totalBudget,
    allocatedBudget,
    remainingBudget: store.totalBudget - allocatedBudget,
    envelopesCount: store.envelopes.length
  });
});

app.use('/envelopes', envelopesRouter);

// A ordem importa: o 404 vem depois de todas as rotas, e o error handler é sempre o último.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
