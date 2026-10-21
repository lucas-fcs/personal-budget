-- Auditoria do invariante do modelo (ver docs/database.md):
--   budget − balance = soma das transações do envelope
-- O banco não consegue garantir essa regra sozinho (ela envolve duas tabelas, e um CHECK só enxerga
-- uma linha); quem a mantém são as transações SQL das rotas. Esta consulta confere o resultado.
--
-- Resultado esperado: 0 linhas. Cada linha listada é um envelope cuja conta não fecha.
--   psql -U budget_app -h localhost -d personal_budget -f db/check-invariant.sql

SELECT e.id,
       e.title,
       e.budget,
       e.balance,
       e.budget - e.balance          AS gasto_pelo_envelope,
       COALESCE(SUM(t.amount), 0)    AS soma_das_transacoes
FROM envelopes e
-- LEFT JOIN mantém os envelopes sem nenhuma transação (para eles, a soma é 0 e o saldo deve ser igual ao teto).
LEFT JOIN transactions t ON t.envelope_id = e.id
GROUP BY e.id
HAVING e.budget - e.balance <> COALESCE(SUM(t.amount), 0)
ORDER BY e.id;
