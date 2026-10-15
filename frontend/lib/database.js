const { Pool } = require('@neondatabase/serverless');

let pool;
let schemaReady;

function getPool() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL não está configurada.');
    }
    pool ||= new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 15000
    });
    return pool;
}

async function initialize() {
    if (!schemaReady) {
        schemaReady = (async () => {
            const database = getPool();
            await database.query(`
                CREATE TABLE IF NOT EXISTS produtos (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(120) NOT NULL,
                    quantidade NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
                    valor NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
                    categoria VARCHAR(80) NOT NULL
                )
            `);
            await database.query(`
                CREATE TABLE IF NOT EXISTS movimentacoes (
                    id SERIAL PRIMARY KEY,
                    tempo TIMESTAMP NOT NULL,
                    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
                    quantidade NUMERIC(14, 3) NOT NULL CHECK (quantidade > 0),
                    id_produto INTEGER NOT NULL REFERENCES produtos(id)
                )
            `);
            await database.query('CREATE INDEX IF NOT EXISTS movimentacoes_tempo_idx ON movimentacoes (tempo)');
            await database.query('CREATE INDEX IF NOT EXISTS movimentacoes_produto_idx ON movimentacoes (id_produto)');
            await database.query(`
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    session_id VARCHAR(36) PRIMARY KEY,
                    expires_at TIMESTAMPTZ NOT NULL
                )
            `);
            await database.query('CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at)');
        })().catch((error) => {
            schemaReady = undefined;
            throw error;
        });
    }
    await schemaReady;
    return getPool();
}

module.exports = { getPool, initialize };
