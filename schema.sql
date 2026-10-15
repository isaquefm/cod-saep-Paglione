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
