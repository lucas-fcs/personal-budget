# Personal Budget API — contexto para o Claude Code

## O que é
API REST de orçamento por envelopes (Node.js + Express 5). A Parte I guardava tudo em memória em `server.js`.
A Parte II (em andamento) adiciona: PostgreSQL com o driver `pg` (Pool + SQL escrito à mão, sem ORM), recurso de transações, documentação Swagger e deploy no Render.
O plano fase a fase está em `docs/ROADMAP.md` — consulte-o antes de começar qualquer tarefa e marque o que foi concluído.

## Objetivo do dono do projeto
Este é um projeto de portfólio/estudo. O dono quer **entender** cada decisão, não só receber código pronto.
- Antes de implementar uma fase, apresente um plano curto e as decisões de design em aberto, com os trade-offs.
- Explique o "porquê" de conceitos novos (Pool de conexões, queries parametrizadas, chaves estrangeiras, BEGIN/COMMIT/ROLLBACK, OpenAPI) em poucas linhas.
- Aponte problemas no código existente e discorde quando houver razão; não valide por educação.
- Trabalhe em passos pequenos e testáveis; ao fim de cada passo, diga como testar (Postman ou curl).

## Convenções
- Idioma: mensagens de erro da API, comentários e README em português.
- Commits: Conventional Commits (`feat(api): ...`, `fix(db): ...`, `docs: ...`), um commit por passo lógico.
- Dinheiro: nunca usar float de JS para persistir. Colunas `DECIMAL(12,2)`; lembrar que o driver `pg` devolve DECIMAL como string.
- Segredos só em `.env` (já está no `.gitignore`); manter um `.env.example` sem valores reais.
- Express 5: erros lançados em handlers `async` já chegam ao middleware de erro; centralizar o tratamento num error handler.
- SQL sempre parametrizado (`$1, $2`), nunca concatenando strings — evita SQL injection.
- Operações que alteram mais de uma linha (transferência, criar/editar/apagar transação) usam um client do pool com `BEGIN` / `COMMIT` / `ROLLBACK` (e `client.release()` no `finally`).

## Comandos
- `npm install` — dependências
- `npm run dev` — servidor em desenvolvimento (porta 3000), com `--watch` e lendo o `.env` nativamente (sem `dotenv`)
- `psql -U postgres -d personal_budget -f db/schema.sql` — cria/recria as tabelas (criado na etapa 5 do roadmap)

## Ambiente
- Windows; projeto dentro de uma pasta do OneDrive.
- PostgreSQL local para desenvolvimento; Render Postgres em produção (variável `DATABASE_URL`, exige SSL).
