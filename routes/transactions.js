const express = require('express');
const db = require('../db');
const { HttpError } = require('../middleware/errors');
const { parseId } = require('../utils/validation');
const { TRANSACTION_COLUMNS, toTransaction } = require('../utils/mappers');

// Rotas de transações, montadas em /transactions no app.js.
// TRANSACTION_COLUMNS é uma constante do código (não vem do usuário), por isso pode entrar no texto
// do SQL; valores vindos da requisição continuam sempre como parâmetros ($1, $2...).
const router = express.Router();

const notFound = (id) => new HttpError(404, `Transação com ID ${id} não encontrada.`);

// Listar todas as transações (GET /transactions), da mais recente para a mais antiga, como num extrato.
// O id desempata transações do mesmo dia (a última registrada aparece primeiro).
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions ORDER BY spent_on DESC, id DESC`
  );
  res.status(200).json(rows.map(toTransaction));
});

// Buscar transação por ID (GET /transactions/:id)
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  const { rows } = await db.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound(id);

  res.status(200).json(toTransaction(rows[0]));
});

module.exports = router;
