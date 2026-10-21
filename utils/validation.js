const { HttpError } = require('../middleware/errors');

// Validação de FORMATO dos dados de entrada. Regras de negócio (saldo insuficiente, título
// duplicado, tamanho do título) ficam nas constraints do banco; ver db/schema.sql.
// Cada função devolve o valor pronto para a query ou lança HttpError(400).

// Maior valor de uma coluna INTEGER do Postgres. Acima disso o banco recusaria com erro 22003.
const MAX_INTEGER = 2147483647;

// Id de rota (ex.: /envelopes/:id). Sem esta checagem, 'abc' chegaria ao Postgres e viraria erro 500.
function parseId(value, label = 'ID') {
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < 1 || number > MAX_INTEGER) {
    throw new HttpError(400, `${label} inválido: deve ser um número inteiro positivo.`);
  }
  return number;
}

// Valor monetário. Aceita número (150.75) ou string ("150.75") e devolve STRING, que segue assim
// para o Postgres: o NUMERIC converte texto com exatidão, sem passar por float.
// Até 10 dígitos inteiros e 2 casas decimais, o limite do NUMERIC(12,2). Sem esta checagem,
// 10.005 seria arredondado em silêncio para 10.01. O padrão também recusa negativos e notação
// científica (1e21).
function parseMoney(value, field, { positive = false } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new HttpError(400, `O campo "${field}" deve ser um valor numérico (ex.: 150 ou "150.75").`);
  }

  const text = String(value).trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    throw new HttpError(400, `O campo "${field}" deve ser um valor não negativo, com no máximo 2 casas decimais (ex.: 150.75).`);
  }
  // Zero é qualquer valor sem um dígito de 1 a 9 ("0", "0.00"); comparamos o texto para não usar float.
  if (positive && !/[1-9]/.test(text)) {
    throw new HttpError(400, `O campo "${field}" deve ser maior que zero.`);
  }
  return text;
}

// Texto obrigatório (title do envelope, recipient da transação), sem espaços nas pontas.
// O tamanho máximo (100) é verificado pelo banco (envelopes_title_length, transactions_recipient_length).
function parseText(value, field) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `O campo "${field}" deve ser um texto.`);
  }
  const text = value.trim();
  if (!text) {
    throw new HttpError(400, `O campo "${field}" não pode ser vazio.`);
  }
  return text;
}

module.exports = { parseId, parseMoney, parseText };
