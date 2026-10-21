const express = require('express');
const db = require('../db');
const { HttpError } = require('../middleware/errors');
const { parseId, parseMoney, parseText } = require('../utils/validation');
const { TRANSACTION_COLUMNS, toTransaction } = require('../utils/mappers');

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
  const title = parseText(req.body.title, 'title');
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

// Listar as transações de um envelope (GET /envelopes/:id/transactions)
// Envelope inexistente → 404; envelope sem transações → [] (respostas diferentes, pois dizem coisas diferentes).
router.get('/:id/transactions', async (req, res) => {
  const id = parseId(req.params.id);

  const envelope = await db.query('SELECT 1 FROM envelopes WHERE id = $1', [id]);
  if (envelope.rows.length === 0) throw notFound(id);

  // Usa o índice transactions_envelope_id_idx (criado na etapa 8) para achar as linhas do envelope.
  const { rows } = await db.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE envelope_id = $1 ORDER BY spent_on DESC, id DESC`,
    [id]
  );
  res.status(200).json(rows.map(toTransaction));
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
  const title = req.body.title === undefined ? null : parseText(req.body.title, 'title');
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
// Move budget E balance juntos: é uma realocação do planejamento, que preserva o invariante
// budget − balance = soma das transações (ver docs/database.md).
router.post('/transfer/:from/:to', async (req, res) => {
  const fromId = parseId(req.params.from, 'ID de origem');
  const toId = parseId(req.params.to, 'ID de destino');
  if (fromId === toId) {
    throw new HttpError(400, 'Os envelopes de origem e destino não podem ser idênticos.');
  }
  if (req.body.amount === undefined) {
    throw new HttpError(400, 'O campo "amount" é obrigatório.');
  }
  const amount = parseMoney(req.body.amount, 'amount', { positive: true });

  const steps = [
    { id: fromId, role: 'origem', sql: 'UPDATE envelopes SET budget = budget - $2, balance = balance - $2 WHERE id = $1 RETURNING id, title, budget, balance' },
    { id: toId, role: 'destino', sql: 'UPDATE envelopes SET budget = budget + $2, balance = balance + $2 WHERE id = $1 RETURNING id, title, budget, balance' }
  ];
  // Cada UPDATE trava a linha até o COMMIT. Se uma transferência A→B e outra B→A rodassem ao mesmo
  // tempo, cada uma travaria uma linha e esperaria a outra para sempre (deadlock). Atualizar sempre
  // na mesma ordem (menor id primeiro) faz a segunda esperar a primeira terminar, em vez de travar.
  steps.sort((a, b) => a.id - b.id);

  // Os dois UPDATEs valem juntos ou nenhum vale: qualquer erro lançado aqui dentro (404 ou a
  // constraint de saldo) faz o withTransaction executar ROLLBACK, desfazendo o UPDATE que já tinha rodado.
  const updated = await db.withTransaction(async (client) => {
    const envelopes = {};
    for (const step of steps) {
      const { rows } = await client.query(step.sql, [step.id, amount]);
      if (rows.length === 0) {
        throw new HttpError(404, `Envelope de ${step.role} (ID ${step.id}) não encontrado.`);
      }
      envelopes[step.role] = rows[0];
    }
    return envelopes;
  });
  // Saldo insuficiente não é verificado com um SELECT antes: entre a leitura e o UPDATE, outra
  // requisição poderia gastar o mesmo dinheiro. A constraint envelopes_balance_non_negative barra
  // o UPDATE da origem no próprio banco, e o error handler responde 400.

  res.status(200).json({
    message: `R$ ${amount} transferidos com sucesso de "${updated.origem.title}" para "${updated.destino.title}".`,
    from: updated.origem,
    to: updated.destino
  });
});

module.exports = router;
