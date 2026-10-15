CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    quantidade NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
    valor NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
    categoria VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS movimentacoes (
    id SERIAL PRIMARY KEY,
    tempo TIMESTAMP NOT NULL,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    quantidade NUMERIC(14, 3) NOT NULL CHECK (quantidade > 0),
    id_produto INTEGER NOT NULL REFERENCES produtos(id)
);

CREATE INDEX IF NOT EXISTS movimentacoes_tempo_idx ON movimentacoes (tempo);
CREATE INDEX IF NOT EXISTS movimentacoes_produto_idx ON movimentacoes (id_produto);

CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id VARCHAR(36) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_users (
    username VARCHAR(64) PRIMARY KEY CHECK (username = lower(username)),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
