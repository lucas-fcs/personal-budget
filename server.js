const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware para parsing de JSON
app.use(express.json());

// --- ESTADO EM MEMÓRIA ---
let totalBudget = 10000;
let envelopes = [];
let nextId = 1;

// Helper: Encontrar índice do envelope por ID
const findEnvelopeIndex = (id) => envelopes.findIndex(e => e.id === Number(id));

// Rota de Health Check e Resumo Orçamentário
app.get('/', (req, res) => {
  const allocatedBudget = envelopes.reduce((acc, env) => acc + env.budget, 0);
  res.status(200).json({
    message: 'API Personal Budget ativa.',
    totalBudget,
    allocatedBudget,
    remainingBudget: totalBudget - allocatedBudget,
    envelopesCount: envelopes.length
  });
});

// Criar novo envelope (POST /envelopes)
app.post('/envelopes', (req, res) => {
  const { title, budget } = req.body;

  if (!title || budget === undefined) {
    return res.status(400).json({ error: 'Os campos "title" e "budget" são obrigatórios.' });
  }

  const parsedBudget = Number(budget);
  if (isNaN(parsedBudget) || parsedBudget <= 0) {
    return res.status(400).json({ error: 'O campo "budget" deve ser um número positivo maior que zero.' });
  }

  const currentAllocated = envelopes.reduce((acc, env) => acc + env.budget, 0);
  if (currentAllocated + parsedBudget > totalBudget) {
    return res.status(400).json({
      error: `Orçamento excedido. Disponível: R$ ${totalBudget - currentAllocated}. Solicitado: R$ ${parsedBudget}.`
    });
  }

  const newEnvelope = {
    id: nextId++,
    title: title.trim(),
    budget: parsedBudget
  };

  envelopes.push(newEnvelope);
  return res.status(201).json(newEnvelope);
});

// Listar todos os envelopes (GET /envelopes)
app.get('/envelopes', (req, res) => {
  return res.status(200).json(envelopes);
});

// Buscar envelope por ID (GET /envelopes/:id)
app.get('/envelopes/:id', (req, res) => {
  const { id } = req.params;
  const envelope = envelopes.find(e => e.id === Number(id));

  if (!envelope) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  return res.status(200).json(envelope);
});

// Atualizar envelope / Extrair valor (PUT /envelopes/:id)
app.put('/envelopes/:id', (req, res) => {
  const { id } = req.params;
  const index = findEnvelopeIndex(id);

  if (index === -1) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  const { title, budget, extract } = req.body;
  const currentEnvelope = envelopes[index];

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

    const otherAllocated = envelopes.reduce((acc, env) => env.id === currentEnvelope.id ? acc : acc + env.budget, 0);
    if (otherAllocated + parsedBudget > totalBudget) {
      return res.status(400).json({
        error: `Orçamento excedido. Limite global disponível: R$ ${totalBudget - otherAllocated}.`
      });
    }
    currentEnvelope.budget = parsedBudget;
  }

  return res.status(200).json(currentEnvelope);
});

//Excluir envelope (DELETE /envelopes/:id)
app.delete('/envelopes/:id', (req, res) => {
  const { id } = req.params;
  const index = findEnvelopeIndex(id);

  if (index === -1) {
    return res.status(404).json({ error: `Envelope com ID ${id} não encontrado.` });
  }

  envelopes.splice(index, 1);
  return res.status(204).send();
});

// Transferir valores entre envelopes (POST /envelopes/transfer/:from/:to)
app.post('/envelopes/transfer/:from/:to', (req, res) => {
  const { from, to } = req.params;
  const { amount } = req.body;

  if (from === to) {
    return res.status(400).json({ error: 'Os envelopes de origem e destino não podem ser idênticos.' });
  }

  const transferAmount = Number(amount);
  if (!amount || isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ error: 'Informe um "amount" numérico e positivo no corpo da requisição.' });
  }

  const originEnvelope = envelopes.find(e => e.id === Number(from));
  const destinationEnvelope = envelopes.find(e => e.id === Number(to));

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

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});