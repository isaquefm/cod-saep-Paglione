const express = require('express');
const router = express.Router();
const mysql = require('../mysql.js');

function validarProduto(req, res) {
    const { nome, quantidade, valor, categoria } = req.body || {};
    const quantidadeNumerica = typeof quantidade === 'number'
        ? quantidade
        : typeof quantidade === 'string' && quantidade.trim()
            ? Number(quantidade)
            : NaN;
    const valorNumerico = typeof valor === 'number'
        ? valor
        : typeof valor === 'string' && valor.trim()
            ? Number(valor)
            : NaN;

    if (typeof nome !== 'string' || !nome.trim() ||
        typeof categoria !== 'string' || !categoria.trim()) {
        res.status(400).json({ error: 'Informe nome e categoria do produto' });
        return null;
    }

    if (quantidade == null || !Number.isFinite(quantidadeNumerica) || quantidadeNumerica < 0) {
        res.status(400).json({ error: 'A quantidade deve ser um número não negativo' });
        return null;
    }

    if (valor == null || !Number.isFinite(valorNumerico) || valorNumerico < 0) {
        res.status(400).json({ error: 'O valor deve ser um número não negativo' });
        return null;
    }

    return { nome: nome.trim(), quantidade: quantidadeNumerica, valor: valorNumerico, categoria: categoria.trim() };
}

router.get('/listar', (req, res) => {
    mysql.query('SELECT * FROM produtos', (err, results) => {
        if (err) {
            console.error('Erro ao listar produtos:', err);
            return res.status(500).json({ error: 'Erro ao listar produtos' });
        }
        return res.json(results);
    });
});

router.post('/cadastro', (req, res) => {
    const produto = validarProduto(req, res);
    if (!produto) return;

    mysql.query(
        'INSERT INTO produtos (nome, quantidade, valor, categoria) VALUES (?, ?, ?, ?)',
        [produto.nome, produto.quantidade, produto.valor, produto.categoria],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'Já existe um produto com esses dados únicos' });
                }
                console.error('Erro ao cadastrar produto:', err);
                return res.status(500).json({ error: 'Erro ao cadastrar produto' });
            }
            return res.status(201).json({ message: 'Produto cadastrado com sucesso', id: result.insertId });
        }
    );
});

router.put('/atualizar/:id', (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) {
        return res.status(400).json({ error: 'Identificador de produto inválido' });
    }
    const produto = validarProduto(req, res);
    if (!produto) return;

    mysql.query(
        'UPDATE produtos SET nome = ?, quantidade = ?, valor = ?, categoria = ? WHERE id = ?',
        [produto.nome, produto.quantidade, produto.valor, produto.categoria, req.params.id],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'Já existe um produto com esses dados únicos' });
                }
                console.error('Erro ao atualizar produto:', err);
                return res.status(500).json({ error: 'Erro ao atualizar produto' });
            }

            if (result.affectedRows > 0) return res.json({ ...produto, id: Number(req.params.id) });

            mysql.query('SELECT id FROM produtos WHERE id = ? LIMIT 1', [req.params.id], (selectErr, rows) => {
                if (selectErr) {
                    console.error('Erro ao verificar produto atualizado:', selectErr);
                    return res.status(500).json({ error: 'Erro ao atualizar produto' });
                }
                if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
                return res.json({ ...produto, id: Number(req.params.id) });
            });
        }
    );
});

router.delete('/excluir/:id', (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) {
        return res.status(400).json({ error: 'Identificador de produto inválido' });
    }

    mysql.query('SELECT id FROM movimentacoes WHERE id_produto = ? LIMIT 1', [req.params.id], (movementErr, movements) => {
        if (movementErr) {
            console.error('Erro ao verificar movimentações do produto:', movementErr);
            return res.status(500).json({ error: 'Erro ao verificar movimentações do produto' });
        }
        if (movements.length > 0) {
            return res.status(409).json({ error: 'Este produto possui movimentações vinculadas e não pode ser excluído' });
        }

        mysql.query('DELETE FROM produtos WHERE id = ?', [req.params.id], (err, result) => {
            if (err) {
                if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
                    return res.status(409).json({ error: 'Este produto possui movimentações vinculadas e não pode ser excluído' });
                }
                console.error('Erro ao excluir produto:', err);
                return res.status(500).json({ error: 'Erro ao excluir produto' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado' });
            return res.status(204).end();
        });
    });
});

router.post('/registro', (req, res) => {
    const { tempo, tipo, quantidade, id_produto } = req.body || {};
    const quantidadeNumerica = typeof quantidade === 'number'
        ? quantidade
        : typeof quantidade === 'string' && quantidade.trim()
            ? Number(quantidade)
            : NaN;
    const idNumerico = typeof id_produto === 'number'
        ? id_produto
        : typeof id_produto === 'string' && id_produto.trim()
            ? Number(id_produto)
            : NaN;
    const dataValida = typeof tempo === 'string' && !Number.isNaN(Date.parse(tempo.replace(' ', 'T')));

    if (!dataValida || !['entrada', 'saida'].includes(tipo) ||
        !Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0 ||
        !Number.isInteger(idNumerico) || idNumerico <= 0) {
        return res.status(400).json({ error: 'Informe data válida, tipo (entrada/saida), quantidade maior que zero e id_produto válido' });
    }

    mysql.getConnection((connectionError, connection) => {
        if (connectionError) {
            console.error('Erro ao obter conexão para movimentação:', connectionError);
            return res.status(500).json({ error: 'Erro ao registrar movimentação' });
        }

        connection.beginTransaction((transactionError) => {
            if (transactionError) {
                connection.release();
                console.error('Erro ao iniciar registro de movimentação:', transactionError);
                return res.status(500).json({ error: 'Erro ao registrar movimentação' });
            }

            const rollbackWithResponse = (status, message, error) => {
                connection.rollback(() => {
                    connection.release();
                    if (error) console.error(message, error);
                    return res.status(status).json({ error: message });
                });
            };

            connection.query('SELECT quantidade FROM produtos WHERE id = ? FOR UPDATE', [idNumerico], (selectError, rows) => {
                if (selectError) return rollbackWithResponse(500, 'Erro ao consultar produto da movimentação', selectError);
                if (rows.length === 0) return rollbackWithResponse(404, 'Produto não encontrado');

                const quantidadeAtual = Number(rows[0].quantidade);
                if (tipo === 'saida' && quantidadeNumerica > quantidadeAtual) {
                    return rollbackWithResponse(409, 'A saída excede a quantidade disponível em estoque');
                }

                const ajuste = tipo === 'entrada' ? quantidadeNumerica : -quantidadeNumerica;
                connection.query('UPDATE produtos SET quantidade = quantidade + ? WHERE id = ?', [ajuste, idNumerico], (updateError) => {
                    if (updateError) return rollbackWithResponse(500, 'Erro ao atualizar estoque da movimentação', updateError);

                    connection.query(
                        'INSERT INTO movimentacoes (tempo, tipo, quantidade, id_produto) VALUES (?, ?, ?, ?)',
                        [tempo, tipo, quantidadeNumerica, idNumerico],
                        (insertError, result) => {
                            if (insertError) return rollbackWithResponse(500, 'Erro ao inserir movimentação', insertError);

                            connection.commit((commitError) => {
                                if (commitError) return rollbackWithResponse(500, 'Erro ao confirmar movimentação', commitError);
                                connection.release();
                                return res.status(201).json({ message: 'Movimentação registrada', id: result.insertId });
                            });
                        }
                    );
                });
            });
        });
    });
});
router.get('/categoria', (req, res) => {
    mysql.query(
        'SELECT categoria, SUM(quantidade * valor) AS total_categoria FROM produtos GROUP BY categoria',
        (err, results) => {
            if (err) {
                console.error('Erro ao consultar totais por categoria:', err);
                return res.status(500).json({ error: 'Erro ao consultar totais por categoria' });
            }
            return res.json(results);
        }
    );
});

router.post('/porcentagem', (req, res) => {
    const limiteMaximo = Number(req.body.limite_maximo ?? 100);
    const limiteMinimo = Number(req.body.limite_minimo ?? 0);
    if (!Number.isFinite(limiteMaximo) || limiteMaximo <= 0 || !Number.isFinite(limiteMinimo) || limiteMinimo < 0) {
        return res.status(400).json({ error: 'Os limites devem ser números válidos e o máximo deve ser maior que zero' });
    }

    const sql = `
        SELECT id, nome, quantidade, categoria,
               ROUND((quantidade::numeric / ?) * 100, 2) AS percentual_atingido
        FROM produtos
        WHERE quantidade <= ? OR quantidade >= ?
    `;
    mysql.query(sql, [limiteMaximo, limiteMinimo, limiteMaximo], (err, results) => {
        if (err) {
            console.error('Erro ao buscar relatório de estoque:', err);
            return res.status(500).json({ error: 'Erro ao buscar relatório de estoque' });
        }
        return res.json({
            filtros_aplicados: { minimo: limiteMinimo, maximo: limiteMaximo },
            produtos_no_limite: results
        });
    });
});

router.post('/relatorio-periodo', (req, res) => {
    const { dataInicial, dataFinal } = req.body;
    if (!dataInicial || !dataFinal) {
        return res.status(400).json({ error: 'Informe dataInicial e dataFinal' });
    }

    const sql = `
        SELECT p.nome, p.categoria AS unidade_medida,
               SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
               SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas,
               SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_periodo,
               SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_entradas,
               SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_saidas
        FROM movimentacoes m
        INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tempo BETWEEN ? AND ?
        GROUP BY p.id, p.nome, p.categoria
    `;
    mysql.query(sql, [dataInicial, dataFinal], (err, results) => {
        if (err) {
            console.error('Erro ao gerar relatório por período:', err);
            return res.status(500).json({ error: 'Erro ao gerar relatório por período' });
        }
        return res.json(results);
    });
});

router.post('/maiores-saidas', (req, res) => {
    const { dataInicial, dataFinal } = req.body;
    if (!dataInicial || !dataFinal) {
        return res.status(400).json({ error: 'Informe dataInicial e dataFinal' });
    }

    const sql = `
        SELECT p.nome,
               SUM(m.quantidade) AS quantidade_total_saida,
               SUM(m.quantidade * p.valor) AS valor_total_financeiro_saida
        FROM movimentacoes m
        INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tipo = 'saida' AND m.tempo BETWEEN ? AND ?
        GROUP BY p.id, p.nome
        ORDER BY quantidade_total_saida DESC
    `;
    mysql.query(sql, [dataInicial, dataFinal], (err, results) => {
        if (err) {
            console.error('Erro ao buscar maiores saídas:', err);
            return res.status(500).json({ error: 'Erro ao buscar maiores saídas' });
        }
        return res.json(results);
    });
});

module.exports = router;


