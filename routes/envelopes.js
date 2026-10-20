const express = require('express');
const db = require('../db');
const store = require('../data/memoryStore');
const { HttpError } = require('../middleware/errors');
const { parseId, parseMoney, parseTitle } = require('../utils/validation');

// Router: um "mini-app" com as rotas de envelopes. É montado em /envelopes no app.js,
// então aqui os caminhos são relativos ('/' = /envelopes, '/:id' = /envelopes/:id).
// As colunas são sempre listadas (nunca SELECT *): uma coluna nova na tabela não vaza para a API sem querer.
const router = express.Router();

const notFound = (id) => new HttpError(404, `Envelope com ID ${id} não encontrado.`);

// Criar novo envelope (POST /envelopes)
router.post('/', async (req, res) => {
  if (req.body.title === undefined || req.body.budget === undefined) {
    throw new HttpError(400, 'Os campos "title" e "budget" são obrigatórios.');
  }
  const title = parseTitle(req.body.title);
  const budget = parseMoney(req.body.budget, 'budget');

  // Um envelope nasce com o saldo igual ao teto: o mesmo parâmetro ($2) vai para as duas colunas.
  const { rows } = await db.query(
    `INSERT INTO envelopes (title, budget, balance)
     VALUES ($1, $2, $2)
     RETURNING id, title, budget, balance`,
    [title, budget]
  );
  res.status(201).json(rows[0]);
});

// Listar todos os envelopes (GET /envelopes)
router.get('/', async (req, res) => {
  // Sem ORDER BY, o Postgres não garante ordem nenhuma.
  const { rows } = await db.query('SELECT id, title, budget, balance FROM envelopes ORDER BY id');
  res.status(200).json(rows);
});

// Buscar envelope por ID (GET /envelopes/:id)
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  const { rows } = await db.query('SELECT id, title, budget, balance FROM envelopes WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound(id);

  res.status(200).json(rows[0]);
});

// Atualizar título e/ou teto (PUT /envelopes/:id). Atualização parcial: só muda o que for enviado.
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  if (req.body.extract !== undefined) {
    throw new HttpError(400, 'O campo "extract" não existe mais: gastos agora são registrados como transações (POST /transactions).');
  }
  if (req.body.title === undefined && req.body.budget === undefined) {
    throw new HttpError(400, 'Informe ao menos um dos campos "title" ou "budget".');
  }
  // null = "não alterar": o COALESCE abaixo mantém o valor atual da coluna.
  const title = req.body.title === undefined ? null : parseTitle(req.body.title);
  const budget = req.body.budget === undefined ? null : parseMoney(req.body.budget, 'budget');

  // O saldo acompanha o teto pela diferença (novo − antigo), preservando o que já foi gasto.
  // Dentro do SET, "budget" à direita ainda é o valor ANTIGO: o Postgres calcula todas as
  // expressões antes de gravar. Se o novo teto for menor que o já gasto, o saldo ficaria
  // negativo e a constraint envelopes_balance_non_negative recusa (400).
  // Uma única instrução sobre uma única linha já é atômica: não precisa de BEGIN/COMMIT.
  const { rows } = await db.query(
    `UPDATE envelopes
     SET title   = COALESCE($2, title),
         budget  = COALESCE($3, budget),
         balance = balance + (COALESCE($3, budget) - budget)
     WHERE id = $1
     RETURNING id, title, budget, balance`,
    [id, title, budget]
  );
  if (rows.length === 0) throw notFound(id);

  res.status(200).json(rows[0]);
});

// Excluir envelope (DELETE /envelopes/:id)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  // Apaga e confirma numa instrução só: rowCount diz se alguma linha foi removida.
  const { rowCount } = await db.query('DELETE FROM envelopes WHERE id = $1', [id]);
  if (rowCount === 0) throw notFound(id);

  res.status(204).send();
});

// Transferir valores entre envelopes (POST /envelopes/transfer/:from/:to)
router.post('/transfer/:from/:to', (req, res) => {
  const { from, to } = req.params;
  const { amount } = req.body;

  if (from === to) {
    return res.status(400).json({ error: 'Os envelopes de origem e destino não podem ser idênticos.' });
  }

  const transferAmount = Number(amount);
  if (!amount || isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ error: 'Informe um "amount" numérico e positivo no corpo da requisição.' });
  }

  const originEnvelope = store.envelopes.find(e => e.id === Number(from));
  const destinationEnvelope = store.envelopes.find(e => e.id === Number(to));

  if (!originEnvelope) {
    return res.status(404).json({ error: `Envelope de origem (ID ${from}) não encontrado.` });
  }
  if (!destinationEnvelope) {
    return res.status(404).json({ error: `Envelope de destino (ID ${to}) não encontrado.` });
  }

  if (originEnvelope.budget < transferAmount) {
    return res.status(400).json({
      error: `Saldo insuficiente no envelope de origem ("${originEnvelope.title}"). Saldo atual: R$ ${originEnvelope.budget}.`
    });
  }

  // Operação Atômica de Transferência
  originEnvelope.budget -= transferAmount;
  destinationEnvelope.budget += transferAmount;

  return res.status(200).json({
    message: `R$ ${transferAmount} transferidos com sucesso de "${originEnvelope.title}" para "${destinationEnvelope.title}".`,
    from: originEnvelope,
    to: destinationEnvelope
  });
});

module.exports = router;
