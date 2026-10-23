const { Pool, types } = require('pg');

// Falha cedo e com mensagem clara, em vez de um erro de conexão confuso na primeira requisição.
if (!process.env.DATABASE_URL) {
  console.error(
    'A variável DATABASE_URL não está definida. Local: copie .env.example para .env e preencha a senha. ' +
    'Render: confira se o serviço foi criado pelo render.yaml (que liga a variável ao banco).'
  );
  process.exit(1);
}

// Por padrão o pg converte DATE em Date do JavaScript à meia-noite LOCAL, e o JSON o serializa em UTC:
// '2026-10-21' viraria "2026-10-21T03:00:00.000Z" (e dia 20 para um cliente em UTC).
// Uma data de calendário não tem hora nem fuso, então mantemos o texto 'YYYY-MM-DD' (1082 = OID do tipo DATE).
types.setTypeParser(types.builtins.DATE, (value) => value);

// O Pool mantém algumas conexões abertas (10 por padrão) e as reaproveita entre requisições.
// Abrir uma conexão nova a cada requisição seria lento: cada uma exige handshake e autenticação.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fuso de cada sessão aberta pelo pool: CURRENT_DATE e NOW() passam a seguir o horário de Brasília,
  // em dev e no Render (que roda em UTC), sem configurar nada no servidor do banco.
  options: '-c timezone=America/Sao_Paulo'
});

// Uma conexão ociosa pode cair (ex.: o Postgres reiniciou). Sem este listener, o erro derrubaria o processo.
// O pool já descarta a conexão quebrada sozinho; aqui só registramos o ocorrido.
pool.on('error', (err) => {
  console.error('Erro em uma conexão ociosa do pool:', err.message);
});

// Consulta simples: o pool empresta uma conexão, executa e a devolve automaticamente.
// Sempre usar parâmetros ($1, $2...) em vez de concatenar valores no SQL.
const query = (text, params) => pool.query(text, params);

// Executa fn(client) dentro de uma transação SQL: tudo é confirmado junto (COMMIT)
// ou nada é aplicado (ROLLBACK). Todas as queries de fn devem usar o client recebido,
// pois uma transação só existe dentro de uma única conexão.
async function withTransaction(fn) {
  const client = await pool.connect();
  let connectionBroken = false;

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Se nem o ROLLBACK funcionou, a conexão provavelmente caiu e não deve voltar ao pool.
      connectionBroken = true;
    }
    throw err;
  } finally {
    // Devolver a conexão é obrigatório: sem isso o pool se esgota e a API trava sem erro.
    // release(true) descarta a conexão em vez de reaproveitá-la.
    client.release(connectionBroken);
  }
}

module.exports = { query, withTransaction };
