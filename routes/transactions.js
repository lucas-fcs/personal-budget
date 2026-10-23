const express = require('express');
const db = require('../db');
const { HttpError } = require('../middleware/errors');
const { parseId, parseMoney, parseText, parseDate } = require('../utils/validation');
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

// Criar transação (POST /transactions): registra o gasto e debita o saldo do envelope, juntos.
router.post('/', async (req, res) => {
  const { body } = req;
  if (body.envelopeId === undefined || body.amount === undefined || body.recipient === undefined) {
    throw new HttpError(400, 'Os campos "envelopeId", "amount" e "recipient" são obrigatórios.');
  }
  const envelopeId = parseId(body.envelopeId, 'envelopeId');
  const amount = parseMoney(body.amount, 'amount', { positive: true });
  const recipient = parseText(body.recipient, 'recipient');
  // null = "não informada": o COALESCE do INSERT usa a data de hoje (CURRENT_DATE, no fuso do pool).
  const spentOn = body.spentOn === undefined ? null : parseDate(body.spentOn, 'spentOn');

  const transaction = await db.withTransaction(async (client) => {
    // 1º debita o envelope. Isso já resolve três coisas:
    // - envelope inexistente: 0 linhas afetadas → 422 (antes de o INSERT esbarrar na chave estrangeira);
    // - saldo insuficiente: a constraint envelopes_balance_non_negative recusa → 400;
    // - a linha do envelope fica travada até o COMMIT, então ninguém o apaga no meio da operação.
    const debit = await client.query(
      'UPDATE envelopes SET balance = balance - $2 WHERE id = $1',
      [envelopeId, amount]
    );
    if (debit.rowCount === 0) {
      // 422 e não 404: a URL /transactions existe; o problema é o envelope citado no corpo.
      throw new HttpError(422, `Envelope com ID ${envelopeId} não encontrado.`);
    }

    // 2º registra a transação. Se este passo falhar, o ROLLBACK desfaz o débito acima.
    const { rows } = await client.query(
      `INSERT INTO transactions (envelope_id, amount, recipient, spent_on)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))
       RETURNING ${TRANSACTION_COLUMNS}`,
      [envelopeId, amount, recipient, spentOn]
    );
    return rows[0];
  });

  res.status(201).json(toTransaction(transaction));
});

// Editar transação (PUT /transactions/:id). Atualização parcial: só muda o que for enviado.
// Pode mudar valor, envelope, destinatário e data, em qualquer combinação.
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { body } = req;
  if ([body.envelopeId, body.amount, body.recipient, body.spentOn].every((value) => value === undefined)) {
    throw new HttpError(400, 'Informe ao menos um dos campos "envelopeId", "amount", "recipient" ou "spentOn".');
  }
  // null = "não alterar".
  const envelopeId = body.envelopeId === undefined ? null : parseId(body.envelopeId, 'envelopeId');
  const amount = body.amount === undefined ? null : parseMoney(body.amount, 'amount', { positive: true });
  const recipient = body.recipient === undefined ? null : parseText(body.recipient, 'recipient');
  const spentOn = body.spentOn === undefined ? null : parseDate(body.spentOn, 'spentOn');

  const transaction = await db.withTransaction(async (client) => {
    // FOR UPDATE trava a linha da transação até o COMMIT. Sem isso, dois PUTs (ou um PUT e um DELETE)
    // simultâneos leriam o mesmo valor antigo e devolveriam/debitariam o dinheiro em dobro.
    const current = await client.query(
      'SELECT envelope_id, amount FROM transactions WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (current.rows.length === 0) throw notFound(id);

    const old = current.rows[0];
    const newEnvelopeId = envelopeId ?? old.envelope_id;
    const newAmount = amount ?? old.amount;

    // Mapa de ajustes: o envelope antigo recebe de volta o valor antigo; o novo paga o valor novo.
    // Um único algoritmo cobre todos os casos:
    //   mesmo envelope, 100 → 150: A recebe 100 e paga 150 (saldo −50)
    //   troca A → B, valor 100:    A recebe 100; B paga 100
    // Os valores ficam como texto e a conta é feita pelo Postgres (balance + crédito − débito), sem float.
    const adjustments = new Map();
    const adjustmentFor = (envelope) => {
      if (!adjustments.has(envelope)) adjustments.set(envelope, { credit: '0', debit: '0' });
      return adjustments.get(envelope);
    };
    adjustmentFor(old.envelope_id).credit = old.amount;
    adjustmentFor(newEnvelopeId).debit = newAmount;

    // Envelopes em ordem crescente de id, como na transferência: evita deadlock com outra operação
    // que trave os mesmos envelopes. O CHECK vale para o saldo final de cada UPDATE (saldo insuficiente → 400).
    const envelopeIds = [...adjustments.keys()].sort((a, b) => a - b);
    for (const envelope of envelopeIds) {
      const { credit, debit } = adjustments.get(envelope);
      const result = await client.query(
        'UPDATE envelopes SET balance = balance + $2 - $3 WHERE id = $1',
        [envelope, credit, debit]
      );
      // O envelope antigo sempre existe (a chave estrangeira garante); só o novo pode não existir.
      // Lançar aqui faz o ROLLBACK desfazer também o ajuste do outro envelope.
      if (result.rowCount === 0) {
        throw new HttpError(422, `Envelope com ID ${envelope} não encontrado.`);
      }
    }

    const { rows } = await client.query(
      `UPDATE transactions
       SET envelope_id = $2,
           amount      = $3,
           recipient   = COALESCE($4, recipient),
           spent_on    = COALESCE($5::date, spent_on)
       WHERE id = $1
       RETURNING ${TRANSACTION_COLUMNS}`,
      [id, newEnvelopeId, newAmount, recipient, spentOn]
    );
    return rows[0];
  });

  res.status(200).json(toTransaction(transaction));
});

// Apagar transação (DELETE /transactions/:id): remove o gasto e devolve o valor ao envelope, juntos.
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  await db.withTransaction(async (client) => {
    // Apaga e já descobre de onde o dinheiro saiu e quanto foi (RETURNING), numa ida ao banco só.
    const { rows } = await client.query(
      'DELETE FROM transactions WHERE id = $1 RETURNING envelope_id, amount',
      [id]
    );
    if (rows.length === 0) throw notFound(id);

    // Devolve o valor ao saldo. Não ultrapassa o teto: pelo invariante, esse valor saiu deste envelope.
    await client.query(
      'UPDATE envelopes SET balance = balance + $2 WHERE id = $1',
      [rows[0].envelope_id, rows[0].amount]
    );
  });

  res.status(204).send();
});

module.exports = router;
