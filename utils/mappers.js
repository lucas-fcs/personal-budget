// Converte linhas do banco (snake_case) no formato público da API (camelCase).
// É o único lugar que define como uma transação aparece no JSON: as rotas nunca devolvem a linha crua.
// (Envelopes não precisam de mapper: suas colunas têm uma palavra só.)

// Colunas lidas de transactions, na mesma ordem em todas as queries.
const TRANSACTION_COLUMNS = 'id, envelope_id, amount, recipient, spent_on';

const toTransaction = (row) => ({
  id: row.id,
  envelopeId: row.envelope_id,
  amount: row.amount,       // string "45.90" (NUMERIC)
  recipient: row.recipient,
  spentOn: row.spent_on     // string "2026-10-21" (DATE, ver db/index.js)
});

module.exports = { TRANSACTION_COLUMNS, toTransaction };
