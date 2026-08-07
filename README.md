# Personal Budget API

API RESTful desenvolvida com Node.js e Express para gerenciamento de orçamento pessoal com base na metodologia de Envelope Budgeting (Orçamento por Envelopes).

O sistema permite criar e gerenciar limites financeiros por categorias, controlar saldos disponíveis, registrar gastos reais e realizar transferências de valores entre envelopes, garantindo a integridade do teto orçamentário global.

---

## Tecnologias Utilizadas

- Runtime: Node.js (v18+)
- Framework Web: Express.js
- Controle de Versão: Git
- Testes de API: Postman

---

## Pré-requisitos e Instalação

### Pré-requisitos
- Node.js instalado na máquina.
- Git configurado.

### Passo a Passo de Execução

1. Clonar o repositório:
   git clone https://github.com/lucas-fcs/personal-budget.git
   cd personal-budget

2. Instalar as dependências:
   npm install

3. Iniciar o servidor:
   
   - Modo Desenvolvimento (com auto-reload):
     node --watch server.js

   - Modo Padrão:
     node server.js

O servidor estará ativo em: http://localhost:3000

---

## Variáveis de Ambiente

| Variável | Descrição | Valor Padrão |
| :--- | :--- | :--- |
| PORT | Porta de execução do servidor HTTP | 3000 |

---

## Documentação da API (Endpoints)

### Resumo das Rotas

| Método | Endpoint | Descrição | Status Sucesso |
| :--- | :--- | :--- | :--- |
| GET | / | Retorna o estado de saúde da API e o resumo do orçamento | 200 OK |
| POST | /envelopes | Cria um novo envelope orçamentário | 201 Created |
| GET | /envelopes | Lista todos os envelopes cadastrados | 200 OK |
| GET | /envelopes/:id | Busca um envelope específico pelo ID | 200 OK |
| PUT | /envelopes/:id | Atualiza dados do envelope ou registra extração (gasto) | 200 OK |
| DELETE | /envelopes/:id | Remove um envelope pelo ID | 204 No Content |
| POST | /envelopes/transfer/:from/:to | Transferência de saldo entre dois envelopes | 200 OK |

---

## Exemplos de Requisição (Body JSON)

1. Criar Envelope (POST /envelopes)
{
  "title": "Mercado",
  "budget": 1200
}

2. Registrar Gasto (PUT /envelopes/:id)
{
  "extract": 150
}

3. Transferir Saldo (POST /envelopes/transfer/:from/:to)
{
  "amount": 300
}

---

## Estrutura do Projeto

personal-budget/
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js