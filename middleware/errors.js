// Erro "esperado", com status HTTP e mensagem segura para mostrar ao cliente.
// Uso nas rotas: throw new HttpError(404, 'Envelope não encontrado.');
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Erros do Postgres que significam "dado inválido" e não "falha do servidor".
// Primeiro pelo nome da constraint (mensagem específica de cada regra do db/schema.sql)...
const PG_CONSTRAINT_ERRORS = {
  envelopes_title_lower_unique: [409, 'Já existe um envelope com esse título.'],
  envelopes_title_length: [400, 'O título deve ter entre 1 e 100 caracteres.'],
  envelopes_balance_non_negative: [400, 'Saldo insuficiente: a operação deixaria o saldo do envelope negativo.']
};

// ...e, se a constraint não estiver mapeada, pelo código do erro (SQLSTATE).
const PG_CODE_ERRORS = {
  23505: [409, 'Já existe um registro com esses dados.'],              // unique_violation
  23514: [400, 'Os dados enviados violam uma regra de validação.'],    // check_violation
  22003: [400, 'Valor numérico fora do limite permitido.']             // numeric_value_out_of_range
};

// Nenhuma rota respondeu: devolve 404 em JSON (o padrão do Express seria uma página HTML).
const notFound = (req, res, next) => {
  next(new HttpError(404, `Rota ${req.method} ${req.originalUrl} não encontrada.`));
};

// Error handler central: o Express o reconhece pelos 4 parâmetros.
// No Express 5, erros lançados em handlers async também chegam aqui.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Se a resposta já começou a ser enviada, só o Express consegue encerrá-la.
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  const pgError = PG_CONSTRAINT_ERRORS[err.constraint] || PG_CODE_ERRORS[err.code];
  if (pgError) {
    const [status, message] = pgError;
    return res.status(status).json({ error: message });
  }

  // Erros do express.json() (body-parser): JSON malformado ou corpo grande demais.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'O corpo da requisição não é um JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'O corpo da requisição é grande demais.' });
  }

  // Qualquer outro erro é inesperado: o detalhe vai só para o log do servidor.
  // A mensagem original pode revelar SQL, caminhos ou estrutura do banco.
  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
};

module.exports = { HttpError, notFound, errorHandler };
