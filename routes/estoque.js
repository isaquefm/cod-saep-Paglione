const express = require('express');
const database = require('../database');
const stockCore = require('../frontend/lib/stock-core.cjs');

const router = express.Router();

function respondWithError(res, error, fallback) {
    const status = error.status || (error.code === '23505' || error.code === '23503' ? 409 : 500);
    if (status >= 500) console.error(fallback, error.message);
    const message = error.status
        ? error.message
        : error.code === '23505'
            ? 'Já existe um produto com esses dados únicos'
            : error.code === '23503'
                ? 'Este produto possui movimentações vinculadas e não pode ser excluído'
                : fallback;
    return res.status(status).json({ error: message });
}

async function run(res, fallback, operation) {
    try { return await operation(); } catch (error) { return respondWithError(res, error, fallback); }
}

router.get('/listar', (req, res) => run(res, 'Erro ao listar produtos', async () => {
    const pool = await database.initialize();
    const result = await pool.query('SELECT * FROM produtos ORDER BY id');
    return res.json(result.rows);
}));

router.post('/cadastro', (req, res) => run(res, 'Erro ao cadastrar produto', async () => {
    const product = stockCore.readProduct(req.body);
    if (product.error) return res.status(400).json({ error: product.error });
    const pool = await database.initialize();
    const id = await stockCore.createProduct(pool, product.value);
    return res.status(201).json({ message: 'Produto cadastrado com sucesso', id });
}));

router.put('/atualizar/:id', (req, res) => run(res, 'Erro ao atualizar produto', async () => {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador de produto inválido' });
    const product = stockCore.readProduct(req.body);
    if (product.error) return res.status(400).json({ error: product.error });
    const pool = await database.initialize();
    return res.json(await stockCore.updateProduct(pool, req.params.id, product.value));
}));

router.delete('/excluir/:id', (req, res) => run(res, 'Erro ao excluir produto', async () => {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Identificador de produto inválido' });
    const pool = await database.initialize();
    await stockCore.inTransaction(pool, async (client) => {
        const movements = await client.query('SELECT 1 FROM movimentacoes WHERE id_produto = $1 LIMIT 1', [req.params.id]);
        if (movements.rowCount) throw new stockCore.StockError(409, 'Este produto possui movimentações vinculadas e não pode ser excluído');
        const result = await client.query('DELETE FROM produtos WHERE id = $1 RETURNING id', [req.params.id]);
        if (!result.rowCount) throw new stockCore.StockError(404, 'Produto não encontrado');
    });
    return res.status(204).end();
}));

router.post('/registro', (req, res) => run(res, 'Erro ao registrar movimentação', async () => {
    const movement = stockCore.readMovement(req.body);
    if (movement.error) return res.status(400).json({ error: movement.error });
    const pool = await database.initialize();
    const id = await stockCore.recordMovement(pool, movement.value);
    return res.status(201).json({ message: 'Movimentação registrada', id });
}));

router.get('/categoria', (req, res) => run(res, 'Erro ao consultar totais por categoria', async () => {
    const pool = await database.initialize();
    const result = await pool.query('SELECT categoria, SUM(quantidade * valor) AS total_categoria FROM produtos GROUP BY categoria ORDER BY categoria');
    return res.json(result.rows);
}));

router.post('/porcentagem', (req, res) => run(res, 'Erro ao buscar relatório de estoque', async () => {
    const max = Number(req.body?.limite_maximo ?? 100);
    const min = Number(req.body?.limite_minimo ?? 0);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(min) || min < 0) {
        return res.status(400).json({ error: 'Os limites devem ser números válidos e o máximo deve ser maior que zero' });
    }
    const pool = await database.initialize();
    const result = await pool.query(`SELECT id, nome, quantidade, categoria,
        ROUND((quantidade::numeric / $1) * 100, 2) AS percentual_atingido
        FROM produtos WHERE quantidade <= $2 OR quantidade >= $3`, [max, min, max]);
    return res.json({ filtros_aplicados: { minimo: min, maximo: max }, produtos_no_limite: result.rows });
}));

router.post('/relatorio-periodo', (req, res) => run(res, 'Erro ao gerar relatório por período', async () => {
    const period = stockCore.readDateRange(req.body?.dataInicial, req.body?.dataFinal);
    if (period.error) return res.status(400).json({ error: period.error });
    const pool = await database.initialize();
    const result = await pool.query(`SELECT p.nome, p.categoria AS unidade_medida,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
        SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_periodo,
        SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_entradas,
        SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_saidas
        FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
        GROUP BY p.id, p.nome, p.categoria`, [period.value.start, period.value.end]);
    return res.json(result.rows);
}));

router.post('/maiores-saidas', (req, res) => run(res, 'Erro ao buscar maiores saídas', async () => {
    const period = stockCore.readDateRange(req.body?.dataInicial, req.body?.dataFinal);
    if (period.error) return res.status(400).json({ error: period.error });
    const pool = await database.initialize();
    const result = await pool.query(`SELECT p.nome,
        SUM(m.quantidade) AS quantidade_total_saida,
        SUM(m.quantidade * p.valor) AS valor_total_financeiro_saida
        FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tipo = 'saida' AND m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
        GROUP BY p.id, p.nome ORDER BY quantidade_total_saida DESC`, [period.value.start, period.value.end]);
    return res.json(result.rows);
}));

module.exports = router;