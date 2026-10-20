// Erro "esperado", com status HTTP e mensagem segura para mostrar ao cliente.
// Uso nas rotas: throw new HttpError(404, 'Envelope não encontrado.');
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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
