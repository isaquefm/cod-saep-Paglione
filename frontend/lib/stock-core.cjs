class StockError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'StockError';
    this.status = status;
  }
}

function parseDecimal(value, fractionDigits, integerDigits) {
  if (!(typeof value === 'number' || typeof value === 'string')) return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [integerPart, fractionPart = ''] = raw.split('.');
  if (integerPart.length > integerDigits || fractionPart.length > fractionDigits) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return { number, scaled: Math.round(number * (10 ** fractionDigits)) };
}

function readProduct(body) {
  const quantity = parseDecimal(body?.quantidade, 3, 11);
  const price = parseDecimal(body?.valor, 2, 12);
  if (typeof body?.nome !== 'string' || !body.nome.trim() || body.nome.trim().length > 120 ||
      typeof body?.categoria !== 'string' || !body.categoria.trim() || body.categoria.trim().length > 80) {
    return { error: 'Informe nome e categoria válidos para o produto' };
  }
  if (!quantity) return { error: 'A quantidade deve ter até 11 dígitos inteiros e 3 casas decimais' };
  if (!price) return { error: 'O valor deve ter até 12 dígitos inteiros e 2 casas decimais' };
  return {
    value: {
      nome: body.nome.trim(),
      quantidade: quantity.number,
      quantidadeMil: quantity.scaled,
      valor: price.number,
      categoria: body.categoria.trim()
    }
  };
}

function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/.exec(value);
  if (!match || !validCalendarDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] || 0);
  const zoneHour = Number(match[7] || 0);
  const zoneMinute = Number(match[8] || 0);
  return hour <= 23 && minute <= 59 && second <= 59 && zoneHour <= 23 && zoneMinute <= 59;
}

function dateOnly(value) {
  if (validCalendarDate(value)) return value;
  if (typeof value === 'string' && value.length > 10 && validTimestamp(value)) return value.slice(0, 10);
  return null;
}

function readDateRange(dataInicial, dataFinal) {
  if (!dataInicial || !dataFinal) return { error: 'Informe dataInicial e dataFinal' };
  const start = dateOnly(dataInicial);
  const end = dateOnly(dataFinal);
  if (!start || !end) return { error: 'Informe datas válidas para o período do relatório' };
  if (start > end) return { error: 'A data inicial não pode ser posterior à data final' };
  return { value: { start, end } };
}

function readMovement(body) {
  const quantity = parseDecimal(body?.quantidade, 3, 11);
  const productId = Number(body?.id_produto);
  if (!validTimestamp(body?.tempo) || !['entrada', 'saida'].includes(body?.tipo) || !quantity || quantity.scaled <= 0 ||
      !Number.isSafeInteger(productId) || productId <= 0) {
    return { error: 'Informe data válida, tipo (entrada/saida), quantidade maior que zero e id_produto válido' };
  }
  return { value: { tempo: body.tempo, tipo: body.tipo, quantidade: quantity.number, quantidadeMil: quantity.scaled, id_produto: productId } };
}

async function inTransaction(pool, operation) {
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query('BEGIN');
    begun = true;
    const result = await operation(client);
    await client.query('COMMIT');
    begun = false;
    return result;
  } catch (error) {
    if (begun) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('Falha ao reverter transação de estoque:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function quantityAsMilli(value) {
  const parsed = parseDecimal(String(value), 3, 11);
  if (!parsed) throw new StockError(409, 'A quantidade armazenada excede a precisão permitida');
  return parsed.scaled;
}

async function createProduct(pool, product, now = new Date()) {
  return inTransaction(pool, async (client) => {
    const inserted = await client.query(
      'INSERT INTO produtos (nome, quantidade, valor, categoria) VALUES ($1, $2, $3, $4) RETURNING id',
      [product.nome, product.quantidade, product.valor, product.categoria]
    );
    const id = inserted.rows[0].id;
    if (product.quantidadeMil > 0) {
      await client.query(
        'INSERT INTO movimentacoes (tempo, tipo, quantidade, id_produto) VALUES ($1, $2, $3, $4)',
        [now, 'entrada', product.quantidade, id]
      );
    }
    return id;
  });
}

async function updateProduct(pool, id, product, now = new Date()) {
  return inTransaction(pool, async (client) => {
    const current = await client.query('SELECT id, quantidade FROM produtos WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rowCount) throw new StockError(404, 'Produto não encontrado');
    const deltaMilli = product.quantidadeMil - quantityAsMilli(current.rows[0].quantidade);
    await client.query(
      'UPDATE produtos SET nome = $1, quantidade = $2, valor = $3, categoria = $4 WHERE id = $5',
      [product.nome, product.quantidade, product.valor, product.categoria, id]
    );
    if (deltaMilli !== 0) {
      const type = deltaMilli > 0 ? 'entrada' : 'saida';
      await client.query(
        'INSERT INTO movimentacoes (tempo, tipo, quantidade, id_produto) VALUES ($1, $2, $3, $4)',
        [now, type, Math.abs(deltaMilli) / 1000, id]
      );
    }
    return { ...product, id: Number(id) };
  });
}

async function recordMovement(pool, movement) {
  return inTransaction(pool, async (client) => {
    const selected = await client.query('SELECT quantidade FROM produtos WHERE id = $1 FOR UPDATE', [movement.id_produto]);
    if (!selected.rowCount) throw new StockError(404, 'Produto não encontrado');
    const currentMilli = quantityAsMilli(selected.rows[0].quantidade);
    if (movement.tipo === 'saida' && movement.quantidadeMil > currentMilli) {
      throw new StockError(409, 'A saída excede a quantidade disponível em estoque');
    }
    const adjustment = movement.tipo === 'entrada' ? movement.quantidade : -movement.quantidade;
    await client.query('UPDATE produtos SET quantidade = quantidade + $1 WHERE id = $2', [adjustment, movement.id_produto]);
    const inserted = await client.query(
      'INSERT INTO movimentacoes (tempo, tipo, quantidade, id_produto) VALUES ($1, $2, $3, $4) RETURNING id',
      [movement.tempo, movement.tipo, movement.quantidade, movement.id_produto]
    );
    return inserted.rows[0].id;
  });
}

module.exports = { StockError, parseDecimal, readProduct, validCalendarDate, validTimestamp, readDateRange, readMovement, inTransaction, createProduct, updateProduct, recordMovement };
