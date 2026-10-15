const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não foi definida no ambiente. Configure a conexão PostgreSQL antes de iniciar a API.');
}

const connection = new URL(process.env.DATABASE_URL);
connection.searchParams.set('sslmode', 'verify-full');
connection.searchParams.set('sslnegotiation', 'direct');
connection.searchParams.delete('channel_binding');

const pool = new Pool({
    connectionString: connection.toString(),
    enableChannelBinding: true,
    connectionTimeoutMillis: 15000
});

pool.on('connect', () => console.log('Conexão com o PostgreSQL estabelecida'));
pool.on('error', (error) => console.error('Erro na conexão com o PostgreSQL:', error.message));

async function initialize() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS produtos (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(120) NOT NULL,
            quantidade NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
            valor NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
            categoria VARCHAR(80) NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS movimentacoes (
            id SERIAL PRIMARY KEY,
            tempo TIMESTAMP NOT NULL,
            tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
            quantidade NUMERIC(14, 3) NOT NULL CHECK (quantidade > 0),
            id_produto INTEGER NOT NULL REFERENCES produtos(id)
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS movimentacoes_tempo_idx ON movimentacoes (tempo)');
    await pool.query('CREATE INDEX IF NOT EXISTS movimentacoes_produto_idx ON movimentacoes (id_produto)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            session_id VARCHAR(36) PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at)');
    return pool;
}

function postgresQuery(client, sql, params, callback) {
    let index = 0;
    let statement = sql.replace(/\?/g, () => `$${++index}`);
    const isInsert = /^\s*INSERT\s+INTO\s+/i.test(statement);
    if (isInsert && !/\bRETURNING\b/i.test(statement)) statement += ' RETURNING id';

    client.query(statement, params || [], (error, result) => {
        if (error) {
            if (error.code === '23505') error.code = 'ER_DUP_ENTRY';
            if (error.code === '23503') error.code = 'ER_ROW_IS_REFERENCED';
            callback(error);
            return;
        }
        if (isInsert) {
            callback(null, { insertId: result.rows[0]?.id, affectedRows: result.rowCount });
        } else if (/^\s*(UPDATE|DELETE)\b/i.test(statement)) {
            callback(null, { affectedRows: result.rowCount });
        } else {
            callback(null, result.rows);
        }
    });
}

module.exports = {
    initialize,
    query(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        postgresQuery(pool, sql, params, callback);
    },
    getConnection(callback) {
        pool.connect((error, client) => {
            if (error) return callback(error);
            callback(null, {
                query(sql, params, done) {
                    if (typeof params === 'function') {
                        done = params;
                        params = [];
                    }
                    postgresQuery(client, sql, params, done);
                },
                beginTransaction(done) { client.query('BEGIN', done); },
                commit(done) { client.query('COMMIT', done); },
                rollback(done) { client.query('ROLLBACK', done); },
                release() { client.release(); }
            });
        });
    }
};
