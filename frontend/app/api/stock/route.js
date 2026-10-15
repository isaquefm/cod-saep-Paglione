import { initialize } from '../../../lib/database';
import auth from '../../../lib/auth.cjs';
import stockCore from '../../../lib/stock-core.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (data, status = 200) => Response.json(data, { status });
const validId = (value) => /^[1-9]\d*$/.test(String(value || ''));

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function handle(request) {
  let client;
  try {
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const checked = auth.preAuthorize(request.headers, { write });
    if (checked.error) return json(checked.error.body, checked.error.status);

    const database = await initialize();
    if (!(await auth.sessionIsActive(database, checked.session))) {
      return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401);
    }

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
      const product = stockCore.readProduct(await readBody(request));
      if (product.error) return json({ error: product.error }, 400);
      const productId = await stockCore.createProduct(database, product.value);
      return json({ message: 'Produto cadastrado com sucesso', id: productId }, 201);
    }
    if (method === 'PUT' && operation === 'atualizar' && id) {
      if (!validId(id)) return json({ error: 'Identificador de produto inválido' }, 400);
      const product = stockCore.readProduct(await readBody(request));
      if (product.error) return json({ error: product.error }, 400);
      return json(await stockCore.updateProduct(database, id, product.value));
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
      const movement = stockCore.readMovement(await readBody(request));
      if (movement.error) return json({ error: movement.error }, 400);
      const movementId = await stockCore.recordMovement(database, movement.value);
      return json({ message: 'Movimentação registrada', id: movementId }, 201);
    }
    if (method === 'POST' && operation === 'porcentagem' && !id) {
      const body = await readBody(request);
      const max = Number(body?.limite_maximo ?? 100);
      const min = Number(body?.limite_minimo ?? 0);
      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(min) || min < 0) {
        return json({ error: 'Os limites devem ser números válidos e o máximo deve ser maior que zero' }, 400);
      }
      const result = await database.query(`SELECT id, nome, quantidade, categoria,
               ROUND((quantidade::numeric / $1) * 100, 2) AS percentual_atingido
        FROM produtos WHERE quantidade <= $2 OR quantidade >= $3`, [max, min, max]);
      return json({ filtros_aplicados: { minimo: min, maximo: max }, produtos_no_limite: result.rows });
    }
    if (method === 'POST' && ['relatorio-periodo', 'maiores-saidas'].includes(operation) && !id) {
      const body = await readBody(request);
      const period = stockCore.readDateRange(body?.dataInicial, body?.dataFinal);
      if (period.error) return json({ error: period.error }, 400);
      if (operation === 'relatorio-periodo') {
        const result = await database.query(`SELECT p.nome, p.categoria AS unidade_medida,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
                 SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_periodo,
                 SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_entradas,
                 SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade * p.valor ELSE 0 END) AS valor_total_saidas
          FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
          WHERE m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
          GROUP BY p.id, p.nome, p.categoria`, [period.value.start, period.value.end]);
        return json(result.rows);
      }
      const result = await database.query(`SELECT p.nome, SUM(m.quantidade) AS quantidade_total_saida,
               SUM(m.quantidade * p.valor) AS valor_total_financeiro_saida
        FROM movimentacoes m INNER JOIN produtos p ON p.id = m.id_produto
        WHERE m.tipo = 'saida' AND m.tempo >= $1::date AND m.tempo < ($2::date + INTERVAL '1 day')
        GROUP BY p.id, p.nome ORDER BY quantidade_total_saida DESC`, [period.value.start, period.value.end]);
      return json(result.rows);
    }
    return json({ error: 'Rota da API não encontrada' }, 404);
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('Falha ao reverter exclusão de produto:', rollbackError.message);
      }
    }
    if (error.status) return json({ error: error.message }, error.status);
    if (error.code === '23505') return json({ error: 'Já existe um produto com esses dados únicos' }, 409);
    if (error.code === '23503') return json({ error: 'Este produto possui movimentações vinculadas e não pode ser excluído' }, 409);
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