-- Cria o usuário dedicado da aplicação e o torna dono do banco personal_budget.
-- Rodar UMA vez, como superusuário, no ambiente local:
--   psql -U postgres -d personal_budget -f db/create-role.sql
-- A senha NÃO fica neste arquivo: defina depois, no psql, com \password budget_app
-- (no Render isso não é necessário: o usuário já vem criado e dono do banco).

-- LOGIN permite conectar; os demais atributos já são o padrão, mas ficam explícitos
-- para deixar claro que este usuário não tem poderes administrativos.
CREATE ROLE budget_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- O dono do banco pode criar tabelas no schema public (Postgres 15+),
-- sem precisar de nenhum privilégio sobre o resto do servidor.
ALTER DATABASE personal_budget OWNER TO budget_app;

-- Por padrão, qualquer usuário (PUBLIC) pode conectar em qualquer banco.
-- Aqui, só o dono (e superusuários) conectam no personal_budget.
REVOKE CONNECT ON DATABASE personal_budget FROM PUBLIC;
