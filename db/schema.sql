-- Schema do banco personal_budget. Modelo e decisões em docs/database.md.
--
-- Rodar como budget_app (dono do banco), NUNCA como postgres: quem cria a tabela vira dono dela,
-- e uma tabela do postgres ficaria inacessível para a API.
--   psql -U budget_app -h localhost -d personal_budget -v ON_ERROR_STOP=1 --single-transaction -f db/schema.sql
--   ON_ERROR_STOP=1      → para no primeiro erro (por padrão o psql seguiria para a próxima instrução)
--   --single-transaction → tudo ou nada: se algo falhar, nada fica aplicado pela metade
--
-- Idempotente: pode rodar de novo sem erro e sem apagar dados (IF NOT EXISTS).
-- Atenção: por isso mesmo, alterar uma coluna AQUI não altera uma tabela que já existe (use ALTER TABLE).

CREATE TABLE IF NOT EXISTS envelopes (
  -- O Postgres gera o id (substitui o nextId da Parte I). ALWAYS recusa ids informados manualmente.
  id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title   TEXT NOT NULL,
  -- NUMERIC é decimal exato (nunca float). O driver pg devolve este tipo como string.
  -- Cuidado: valores com mais de 2 casas são ARREDONDADOS em silêncio (10.005 → 10.01).
  budget  NUMERIC(12, 2) NOT NULL,   -- teto planejado
  balance NUMERIC(12, 2) NOT NULL,   -- saldo disponível; na criação, a API grava balance = budget

  -- Constraints com nome: quando uma falha, o erro do pg traz esse nome em err.constraint,
  -- e o error handler da API pode responder com uma mensagem específica para cada regra.
  CONSTRAINT envelopes_title_trimmed         CHECK (title = BTRIM(title)),
  CONSTRAINT envelopes_title_length          CHECK (char_length(title) BETWEEN 1 AND 100),
  CONSTRAINT envelopes_budget_non_negative   CHECK (budget >= 0),
  -- Esta é a verificação de "saldo insuficiente": um UPDATE que deixaria o saldo negativo é recusado
  -- pelo próprio banco, mesmo com duas requisições simultâneas.
  CONSTRAINT envelopes_balance_non_negative  CHECK (balance >= 0),
  -- Rede de segurança do invariante budget − balance = soma das transações (ver docs/database.md).
  CONSTRAINT envelopes_balance_within_budget CHECK (balance <= budget)
);

-- Título único sem diferenciar maiúsculas ("Mercado" e "mercado" colidem).
-- Precisa ser um índice porque a constraint UNIQUE não aceita expressões como LOWER(title).
-- Uma violação gera o erro 23505, com o nome do índice em err.constraint.
CREATE UNIQUE INDEX IF NOT EXISTS envelopes_title_lower_unique ON envelopes (LOWER(title));
