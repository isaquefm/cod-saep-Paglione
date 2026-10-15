import { initialize } from '../../../lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (data, status = 200) => Response.json(data, { status });
const validId = (value) => /^[1-9]\d*$/.test(String(value || ''));

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function readProduct(body) {
  const quantidade = Number(body?.quantidade);
  const valor = Number(body?.valor);
  if (typeof body?.nome !== 'string' || !body.nome.trim() || body.nome.trim().length > 120 ||
      typeof body?.categoria !== 'string' || !body.categoria.trim() || body.categoria.trim().length > 80) {
    return { error: 'Informe nome e categoria válidos para o produto' };
  }
  if (body?.quantidade == null || !Number.isFinite(quantidade) || quantidade < 0) return { error: 'A quantidade deve ser um número não negativo' };
  if (body?.valor == null || !Number.isFinite(valor) || valor < 0) return { error: 'O valor deve ser um número não negativo' };
  return { value: { nome: body.nome.trim(), quantidade, valor, categoria: body.categoria.trim() } };
}

async function handle(request) {
  let client;
  try {
    const database = await initialize();
    const action = new URL(request.url).searchParams.get('path') || '';
    const [operation, id, ...extra] = action.split('/');
    const method = request.method;
    if (extra.length) return json({ error: 'Rota da API não encontrada' }, 404);

    if (method === 'GET' && operation === 'listar' && !id) {
      const result = await database.query('SELECT * FROM produtos ORDER BY id');
      return json(result.rows);
    }
    if (method === 'GET' && operation === 'categoria' && !id) {
      const result = await database.query('SELECT categoria, SUM(quantidade * valor) AS total_categoria FROM produtos GROUP BY categoria ORDER BY categoria');
      return json(result.rows);
    }
    if (method === 'POST' && operation === 'cadastro' && !id) {
      const product = readProduct(await readBody(request));
      if (product.error) return json({ error: product.error }, 400);
      const result = await database.query(
        'INSERT INTO produtos (nome, quantidade, valor, categoria) VALUES ($1, $2, $3, $4) RETURNING id',
        [product.value.nome, product.value.quantidade, product.value.valor, product.value.categoria]
      );
      return json({ message: 'Produto cadastrado com sucesso', id: result.rows[0].id }, 201);
    }
    if (method === 'PUT' && operation === 'atualizar' && id) {
      if (!validId(id)) return json({ error: 'Identificador de produto inválido' }, 400);
      const product = readProduct(await readBody(request));
      if (product.error) return json({ error: product.error }, 400);
      const result = await database.query(
        'UPDATE produtos SET nome = $1, quantidade = $2, valor = $3, categoria = $4 WHERE id = $5 RETURNING id',
        [product.value.nome, product.value.quantidade, product.value.valor, product.value.categoria, id]
      );
      if (!result.rowCount) return json({ error: 'Produto não encontrado' }, 404);
      return json({ ...product.value, id: Number(id) });
    }
    if (method === 'DELETE' && operation === 'excluir' && id) {
      if (!validId(id)) return json({ error: 'Identificador de produto inválido' }, 400);
      client = await database.connect();
      await client.query('BEGIN');
      const movements = await client.query('SELECT 1 FROM movimentacoes WHERE id_produto = $1 LIMIT 1', [id]);
      if (movements.rowCount) {
        await client.query('ROLLBACK');
        return json({ error: 'Este produto possui movimentações vinculadas e não pode ser excluído' }, 409);
      }
      const result = await client.query('DELETE FROM produtos WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return json({ error: 'Produto não encontrado' }, 404);
      }
      await client.query('COMMIT');
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && operation === 'registro' && !id) {
      const body = await readBody(request);
      const quantity = Number(body?.quantidade);
      const productId = Number(body?.id_produto);
      const validDate = typeof body?.tempo === 'string' && !Number.isNaN(Date.parse(body.tempo.replace(' ', 'T')));
      if (!validDate || !['entrada', 'saida'].includes(body?.tipo) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(productId) || productId <= 0) {
        return json({ error: 'Informe data válida, tipo (entrada/saida), quantidade maior que zero e id_produto válido' }, 400);
      }
      client = await database.connect();
      await client.query('BEGIN');
      const selected = await client.query('SELECT quantidade FROM produtos WHERE id = $1 FOR UPDATE', [productId]);
      if (!selected.rowCount) {
        await client.query('ROLLBACK');
        return json({ error: 'Produto não encontrado' }, 404);
      }
      if (body.tipo === 'saida' && quantity > Number(selected.rows[0].quantidade)) {
        await client.query('ROLLBACK');
        return json({ error: 'A saída excede a quantidade disponível em estoque' }, 409);
      }
      const adjustment = body.tipo === 'entrada' ? quantity : -quantity;
      await client.query('UPDATE produtos SET quantidade = quantidade + $1 WHERE id = $2', [adjustment, productId]);
      const inserted = await client.query(
        'INSERT INTO movimentacoes (tempo, tipo, quantidade, id_produto) VALUES ($1, $2, $3, $4) RETURNING id',
        [body.tempo, body.tipo, quantity, productId]
      );
      await client.query('COMMIT');
      return json({ message: 'Movimentação registrada', id: inserted.rows[0].id }, 201);
    }
    if (method === 'POST' && operation === 'porcentagem' && !id) {
      const body = await readBody(request);
      const max = Number(body?.limite_maximo ?? 100);
      const min = Number(body?.limite_minimo ?? 0);
      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(min) || min < 0) {
        return json({ error: 'Os limites devem ser números válidos e o máximo deve ser maior que zero' }, 400);
      }
      const result = await database.query(`
        SELECT id, nome, quantidade, categoria,
               ROUND((quantidade::numeric / $1) * 100, 2) AS percentual_atingido
        FROM produtos WHERE quantidade <= $2 OR quantidade >= $3
      `, [max, min, max]);
      return json({ filtros_aplicados: { minimo: min, maximo: max }, produtos_no_limite: result.rows });
    }
    if (method === 'POST' && ['relatorio-periodo', 'maiores-saidas'].includes(operation) && !id) {
      const body = await readBody(request);
      const { dataInicial, dataFinal } = body || {};
      if (!dataInicial || !dataFinal) return json({ error: 'Informe dataInicial e dataFinal' }, 400);
      if (operation === 'relatorio-periodo') {
        const result = await database.query(`
          SELECT p.nome, p.categoria AS unidade_medida,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
                 SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_periodo,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_entradas,
                 SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_saidas
          FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
          WHERE m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
          GROUP BY p.id, p.nome, p.categoria
        `, [dataInicial, dataFinal]);
        return json(result.rows);
      }
      const result = await database.query(`
        SELECT p.nome, SUM(m.quantidade) AS quantidade_total_saida,
               SUM(m.quantidade * p.valor) AS valor_total_financeiro_saida
        FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tipo = 'saida' AND m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
        GROUP BY p.id, p.nome ORDER BY quantidade_total_saida DESC
      `, [dataInicial, dataFinal]);
      return json(result.rows);
    }
    return json({ error: 'Rota da API não encontrada' }, 404);
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('Erro na API de estoque:', error.message);
    return json({ error: 'Não foi possível concluir a solicitação da API de estoque.' }, 500);
  } finally {
    client?.release();
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
