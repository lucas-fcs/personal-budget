const express = require('express');
const store = require('../data/memoryStore');

// Router: um "mini-app" com as rotas de envelopes. É montado em /envelopes no app.js,
// então aqui os caminhos são relativos ('/' = /envelopes, '/:id' = /envelopes/:id).
const router = express.Router();

// Helper: Encontrar índice do envelope por ID
const findEnvelopeIndex = (id) => store.envelopes.findIndex(e => e.id === Number(id));

// Criar novo envelope (POST /envelopes)
router.post('/', (req, res) => {
  const { title, budget } = req.body;

  if (!title || budget === undefined) {
    return res.status(400).json({ error: 'Os campos "title" e "budget" são obrigatórios.' });
  }

  const parsedBudget = Number(budget);
  if (isNaN(parsedBudget) || parsedBudget <= 0) {
    return res.status(400).json({ error: 'O campo "budget" deve ser um número positivo maior que zero.' });
  }

  const currentAllocated = store.envelopes.reduce((acc, env) => acc + env.budget, 0);
  if (currentAllocated + parsedBudget > store.totalBudget) {
    return res.status(400).json({
      error: `Orçamento excedido. Disponível: R$ ${store.totalBudget - currentAllocated}. Solicitado: R$ ${parsedBudget}.`
    });
  }

  const newEnvelope = {
    id: store.nextId++,
    title: title.trim(),
    budget: parsedBudget
  };

  store.envelopes.push(newEnvelope);
  return res.status(201).json(newEnvelope);
});

// Listar todos os envelopes (GET /envelopes)
router.get('/', (req, res) => {
  return res.status(200).json(store.envelopes);
});

// Buscar envelope por ID (GET /envelopes/:id)
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const envelope = store.envelopes.find(e => e.id === Number(id));

  if (!envelope) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  return res.status(200).json(envelope);
});

// Atualizar envelope / Extrair valor (PUT /envelopes/:id)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const index = findEnvelopeIndex(id);

  if (index === -1) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  const { title, budget, extract } = req.body;
  const currentEnvelope = store.envelopes[index];

  // Extração de saldo (Gasto real)
  if (extract !== undefined) {
    const amountToExtract = Number(extract);
    if (isNaN(amountToExtract) || amountToExtract <= 0) {
      return res.status(400).json({ error: 'O valor de "extract" deve ser um número positivo.' });
    }
    if (amountToExtract > currentEnvelope.budget) {
      return res.status(400).json({
        error: `Saldo insuficiente no envelope. Saldo atual: R$ ${currentEnvelope.budget}. Tentativa de extração: R$ ${amountToExtract}.`
      });
    }
    currentEnvelope.budget -= amountToExtract;
    return res.status(200).json(currentEnvelope);
  }

  // Atualização de atributos (Título ou novo Teto de Orçamento)
  if (title) currentEnvelope.title = title.trim();
  if (budget !== undefined) {
    const parsedBudget = Number(budget);
    if (isNaN(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({ error: 'O valor de "budget" deve ser um número não negativo.' });
    }

    const otherAllocated = store.envelopes.reduce((acc, env) => env.id === currentEnvelope.id ? acc : acc + env.budget, 0);
    if (otherAllocated + parsedBudget > store.totalBudget) {
      return res.status(400).json({
        error: `Orçamento excedido. Limite global disponível: R$ ${store.totalBudget - otherAllocated}.`
      });
    }
    currentEnvelope.budget = parsedBudget;
  }

  return res.status(200).json(currentEnvelope);
});

//Excluir envelope (DELETE /envelopes/:id)
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const index = findEnvelopeIndex(id);

  if (index === -1) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  store.envelopes.splice(index, 1);
  return res.status(204).send();
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
