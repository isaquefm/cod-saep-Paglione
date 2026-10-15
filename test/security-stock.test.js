const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../frontend/lib/auth.cjs');
const stock = require('../frontend/lib/stock-core.cjs');

const authEnv = {
  NODE_ENV: 'test',
  STOCK_ADMIN_USERNAME: 'admin-test',
  STOCK_ADMIN_PASSWORD: 'senha-de-teste-nao-usar-em-producao',
  SESSION_SECRET: 't'.repeat(48),
  APP_ORIGIN: 'http://localhost:3000'
};

class MemorySessionPool {
  constructor() { this.sessions = new Map(); this.users = new Map(); }
  async query(sql, values) {
    if (sql.startsWith('DELETE FROM admin_sessions WHERE expires_at')) {
      for (const [id, expiry] of this.sessions) if (expiry <= values[0]) this.sessions.delete(id);
      return { rowCount: 0, rows: [] };
    }
    if (sql.startsWith('INSERT INTO admin_sessions')) {
      this.sessions.set(values[0], values[1]);
      return { rowCount: 1, rows: [] };
    }
    if (sql.startsWith('SELECT 1 FROM admin_sessions')) {
      const expiry = this.sessions.get(values[0]);
      return { rowCount: expiry && expiry > values[1] ? 1 : 0, rows: expiry ? [{ '?column?': 1 }] : [] };
    }
    if (sql.startsWith('SELECT password_hash FROM admin_users')) {
      const user = this.users.get(values[0]);
      return { rowCount: user ? 1 : 0, rows: user ? [{ password_hash: user.password_hash }] : [] };
    }
    if (sql.startsWith('SELECT username, created_at FROM admin_users')) {
      return { rowCount: this.users.size, rows: [...this.users.values()].map(({ username, created_at }) => ({ username, created_at })) };
    }
    if (sql.startsWith('INSERT INTO admin_users')) {
      if (this.users.has(values[0])) { const error = new Error('duplicate'); error.code = '23505'; throw error; }
      this.users.set(values[0], { username: values[0], password_hash: values[1], created_at: new Date(0) });
      return { rowCount: 1, rows: [] };
    }
    if (sql.startsWith('DELETE FROM admin_sessions WHERE session_id')) {
      const deleted = this.sessions.delete(values[0]);
      return { rowCount: deleted ? 1 : 0, rows: [] };
    }
    throw new Error('Unexpected auth SQL: ' + sql);
  }
}

class MemoryStockPool {
  constructor() {
    this.state = { products: [], movements: [], nextProductId: 1, nextMovementId: 1 };
    this.tail = Promise.resolve();
    this.failMovementInsert = false;
    this.failProductUpdate = false;
  }
  async acquire() {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    return release;
  }
  async connect() {
    const pool = this;
    let working;
    let releaseLock;
    return {
      async query(sql, values = []) {
        if (sql === 'BEGIN') {
          releaseLock = await pool.acquire();
          working = structuredClone(pool.state);
          return { rows: [], rowCount: null };
        }
        if (sql === 'COMMIT') {
          pool.state = working;
          releaseLock?.();
          releaseLock = null;
          return { rows: [], rowCount: null };
        }
        if (sql === 'ROLLBACK') {
          releaseLock?.();
          releaseLock = null;
          return { rows: [], rowCount: null };
        }
        if (sql.startsWith('INSERT INTO produtos')) {
          const row = { id: working.nextProductId++, nome: values[0], quantidade: values[1], valor: values[2], categoria: values[3] };
          working.products.push(row);
          return { rows: [{ id: row.id }], rowCount: 1 };
        }
        if (sql.startsWith('SELECT id, quantidade FROM produtos')) {
          const row = working.products.find((product) => product.id === Number(values[0]));
          return { rows: row ? [{ id: row.id, quantidade: row.quantidade }] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith('SELECT quantidade FROM produtos')) {
          const row = working.products.find((product) => product.id === Number(values[0]));
          return { rows: row ? [{ quantidade: row.quantidade }] : [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith('UPDATE produtos SET nome')) {
          if (pool.failProductUpdate) throw new Error('forced product update failure');
          const row = working.products.find((product) => product.id === Number(values[4]));
          if (row) Object.assign(row, { nome: values[0], quantidade: values[1], valor: values[2], categoria: values[3] });
          return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith('UPDATE produtos SET quantidade = quantidade +')) {
          const row = working.products.find((product) => product.id === Number(values[1]));
          if (row) row.quantidade = Number(row.quantidade) + Number(values[0]);
          return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO movimentacoes')) {
          if (pool.failMovementInsert) throw new Error('forced movement insert failure');
          const row = { id: working.nextMovementId++, tempo: values[0], tipo: values[1], quantidade: values[2], id_produto: Number(values[3]) };
          working.movements.push(row);
          return { rows: /RETURNING id/.test(sql) ? [{ id: row.id }] : [], rowCount: 1 };
        }
        throw new Error('Unexpected stock SQL: ' + sql);
      },
      release() { releaseLock?.(); releaseLock = null; }
    };
  }
}

function parsedProduct(quantity, other = {}) {
  const result = stock.readProduct({ nome: 'Arroz', quantidade: quantity, valor: '12.34', categoria: 'Grãos', ...other });
  assert.equal(result.error, undefined);
  return result.value;
}

test('auth config fails closed and requires a strong session secret', () => {
  assert.throws(() => auth.getConfig({ ...authEnv, SESSION_SECRET: '' }), { status: 503 });
  assert.throws(() => auth.getConfig({ ...authEnv, SESSION_SECRET: 'short' }), { status: 503 });
  assert.throws(() => auth.getConfig({ ...authEnv, NODE_ENV: 'production', APP_ORIGIN: 'http://example.test' }), { status: 503 });
});

test('login, protected reads, CSRF writes, logout and session expiry', async () => {
  const pool = new MemorySessionPool();
  const now = Date.UTC(2026, 0, 1);
  const login = await auth.login(pool, { username: authEnv.STOCK_ADMIN_USERNAME, password: authEnv.STOCK_ADMIN_PASSWORD }, authEnv.APP_ORIGIN, authEnv, now);
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  assert.equal((await auth.authorize(pool, {}, {}, authEnv, now)).error.status, 401);

  const cookie = login.cookie.split(';')[0];
  const headers = { cookie, origin: authEnv.APP_ORIGIN, 'x-csrf-token': login.body.csrfToken };
  assert.ok((await auth.authorize(pool, { cookie }, {}, authEnv, now)).session);
  assert.equal((await auth.authorize(pool, { cookie, origin: 'https://attacker.example' }, { write: true }, authEnv, now)).error.status, 403);
  assert.equal((await auth.authorize(pool, { cookie, origin: authEnv.APP_ORIGIN }, { write: true }, authEnv, now)).error.status, 403);
  assert.ok((await auth.authorize(pool, headers, { write: true }, authEnv, now)).session);

  const ended = await auth.logout(pool, headers, authEnv, now);
  assert.equal(ended.status, 204);
  assert.match(ended.cookie, /Max-Age=0/);
  assert.equal((await auth.authorize(pool, { cookie }, {}, authEnv, now)).error.status, 401);

  const expiring = await auth.login(pool, { username: authEnv.STOCK_ADMIN_USERNAME, password: authEnv.STOCK_ADMIN_PASSWORD }, authEnv.APP_ORIGIN, authEnv, now);
  const expiredCookie = expiring.cookie.split(';')[0];
  assert.equal((await auth.authorize(pool, { cookie: expiredCookie }, {}, authEnv, now + auth.SESSION_SECONDS * 1000)).error.status, 401);
});

test('login rejects bad credentials and untrusted origins', async () => {
  const pool = new MemorySessionPool();
  assert.equal((await auth.login(pool, { username: 'wrong', password: 'wrong' }, authEnv.APP_ORIGIN, authEnv)).status, 401);
  assert.equal((await auth.login(pool, { username: authEnv.STOCK_ADMIN_USERNAME, password: authEnv.STOCK_ADMIN_PASSWORD }, 'https://attacker.example', authEnv)).status, 403);
  assert.equal(pool.sessions.size, 0);
});

test('only an administrator can create registered user accounts', async () => {
  const pool = new MemorySessionPool();
  const created = await auth.createUser(pool, 'Maria.Silva', 'uma-senha-segura-123', authEnv);
  assert.equal(created.status, 201);
  assert.equal(pool.users.get('maria.silva').password_hash.includes('uma-senha-segura-123'), false);
  assert.equal((await auth.createUser(pool, 'maria.silva', 'outra-senha-segura-123', authEnv)).status, 409);
  assert.equal((await auth.createUser(pool, 'x', 'short', authEnv)).status, 400);

  const userLogin = await auth.login(pool, { username: 'maria.silva', password: 'uma-senha-segura-123' }, authEnv.APP_ORIGIN, authEnv);
  assert.equal(userLogin.status, 200);
  assert.equal(userLogin.body.isAdmin, false);
  const userCookie = userLogin.cookie.split(';')[0];
  const userHeaders = { cookie: userCookie, origin: authEnv.APP_ORIGIN, 'x-csrf-token': userLogin.body.csrfToken };
  assert.equal((await auth.authorize(pool, { cookie: userCookie }, {}, authEnv)).session.admin, false);
  assert.equal((await auth.authorizeAdmin(pool, userHeaders, { write: true }, authEnv)).error.status, 403);

  const adminLogin = await auth.login(pool, { username: authEnv.STOCK_ADMIN_USERNAME, password: authEnv.STOCK_ADMIN_PASSWORD }, authEnv.APP_ORIGIN, authEnv);
  const adminCookie = adminLogin.cookie.split(';')[0];
  const adminHeaders = { cookie: adminCookie, origin: authEnv.APP_ORIGIN, 'x-csrf-token': adminLogin.body.csrfToken };
  assert.ok((await auth.authorizeAdmin(pool, adminHeaders, { write: true }, authEnv)).session.admin);
});

test('session cookie is secure in production and signatures cannot be altered', () => {
  const production = { ...authEnv, NODE_ENV: 'production', APP_ORIGIN: 'https://stock.example' };
  const session = auth.createSession(production.STOCK_ADMIN_USERNAME, production, 1000);
  assert.match(auth.makeCookie(session.token, production), /; Secure/);
  assert.equal(auth.verifySession(session.token + 'x', production, 1000), null);
  assert.equal(auth.verifySession(session.token, production, (session.exp + 1) * 1000), null);
});

test('protected Express stock routes reject requests without a session; health remains public', async (t) => {
  const keys = ['DATABASE_URL', 'NODE_ENV', 'STOCK_ADMIN_USERNAME', 'STOCK_ADMIN_PASSWORD', 'SESSION_SECRET', 'APP_ORIGIN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/test';
  process.env.NODE_ENV = 'test';
  Object.assign(process.env, authEnv);
  const app = require('../app');
  const database = require('../database');
  const originalInitialize = database.initialize;
  const fakePool = new MemorySessionPool();
  fakePool.query = async function query(sql, values) {
    if (sql.startsWith('SELECT * FROM produtos')) return { rows: [], rowCount: 0 };
    return MemorySessionPool.prototype.query.call(this, sql, values);
  };
  database.initialize = async () => fakePool;
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.initialize = originalInitialize;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  const health = await fetch(origin + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  for (const [path, method] of [['/loja/listar', 'GET'], ['/loja/categoria', 'GET'], ['/loja/cadastro', 'POST'], ['/loja/registro', 'POST'], ['/loja/relatorio-periodo', 'POST']]) {
    const response = await fetch(origin + path, { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? '{}' : undefined });
    assert.equal(response.status, 401, path + ' must require a session');
  }

  const loginResponse = await fetch(origin + '/auth/login', {
    method: 'POST',
    headers: { Origin: authEnv.APP_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: authEnv.STOCK_ADMIN_USERNAME, password: authEnv.STOCK_ADMIN_PASSWORD })
  });
  assert.equal(loginResponse.status, 200);
  const loginResult = await loginResponse.json();
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const createUserResponse = await fetch(origin + '/auth/users', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: authEnv.APP_ORIGIN, 'X-CSRF-Token': loginResult.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador.um', password: 'senha-forte-operador-123' })
  });
  assert.equal(createUserResponse.status, 201);
  const userLoginResponse = await fetch(origin + '/auth/login', {
    method: 'POST', headers: { Origin: authEnv.APP_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador.um', password: 'senha-forte-operador-123' })
  });
  assert.equal(userLoginResponse.status, 200);
  const userLogin = await userLoginResponse.json();
  const userCookie = userLoginResponse.headers.get('set-cookie').split(';')[0];
  assert.equal(userLogin.isAdmin, false);
  const deniedUserCreation = await fetch(origin + '/auth/users', {
    method: 'POST',
    headers: { Cookie: userCookie, Origin: authEnv.APP_ORIGIN, 'X-CSRF-Token': userLogin.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador.dois', password: 'senha-forte-operador-456' })
  });
  assert.equal(deniedUserCreation.status, 403);
  const authorized = await fetch(origin + '/loja/listar', { headers: { Cookie: cookie } });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), []);

  const deniedWrite = await fetch(origin + '/loja/cadastro', {
    method: 'POST', headers: { Cookie: cookie, Origin: authEnv.APP_ORIGIN, 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(deniedWrite.status, 403);
  const logoutResponse = await fetch(origin + '/auth/logout', {
    method: 'POST', headers: { Cookie: cookie, Origin: authEnv.APP_ORIGIN, 'X-CSRF-Token': loginResult.csrfToken }
  });
  assert.equal(logoutResponse.status, 204);
  const invalidated = await fetch(origin + '/loja/listar', { headers: { Cookie: cookie } });
  assert.equal(invalidated.status, 401);
});

test('creating a product records its opening balance in the same transaction', async () => {
  const pool = new MemoryStockPool();
  await stock.createProduct(pool, parsedProduct('4.125'), new Date('2026-01-01T00:00:00Z'));
  assert.equal(pool.state.products[0].quantidade, 4.125);
  assert.deepEqual(pool.state.movements.map(({ tipo, quantidade }) => ({ tipo, quantidade })), [{ tipo: 'entrada', quantidade: 4.125 }]);
  await stock.createProduct(pool, parsedProduct('0'), new Date('2026-01-01T00:00:00Z'));
  assert.equal(pool.state.movements.length, 1);
});

test('product quantity edits create matching entry and exit movements', async () => {
  const pool = new MemoryStockPool();
  const id = await stock.createProduct(pool, parsedProduct('10'));
  await stock.updateProduct(pool, id, parsedProduct('12.005'));
  await stock.updateProduct(pool, id, parsedProduct('3.125'));
  assert.equal(pool.state.products[0].quantidade, 3.125);
  assert.deepEqual(pool.state.movements.map(({ tipo, quantidade }) => [tipo, quantidade]), [
    ['entrada', 10], ['entrada', 2.005], ['saida', 8.88]
  ]);
  assert.equal(stock.readProduct({ nome: 'Arroz', quantidade: '-1', valor: '1', categoria: 'Grãos' }).error !== undefined, true);
});

test('failed product or movement writes roll back the complete inventory transaction', async () => {
  const pool = new MemoryStockPool();
  pool.failMovementInsert = true;
  await assert.rejects(stock.createProduct(pool, parsedProduct('5')));
  assert.equal(pool.state.products.length, 0);
  assert.equal(pool.state.movements.length, 0);
  pool.failMovementInsert = false;
  const id = await stock.createProduct(pool, parsedProduct('10'));
  const oldProduct = structuredClone(pool.state.products[0]);
  const oldMovements = structuredClone(pool.state.movements);
  pool.failMovementInsert = true;
  await assert.rejects(stock.updateProduct(pool, id, parsedProduct('8')));
  assert.deepEqual(pool.state.products[0], oldProduct);
  assert.deepEqual(pool.state.movements, oldMovements);
  pool.failMovementInsert = false;
  pool.failProductUpdate = true;
  await assert.rejects(stock.updateProduct(pool, id, parsedProduct('12')));
  assert.deepEqual(pool.state.products[0], oldProduct);
  assert.deepEqual(pool.state.movements, oldMovements);
});

test('stock-outs above the available balance are rejected without changing data', async () => {
  const pool = new MemoryStockPool();
  const id = await stock.createProduct(pool, parsedProduct('2'));
  const movement = stock.readMovement({ tempo: '2026-01-01 12:00:00', tipo: 'saida', quantidade: 3, id_produto: id });
  await assert.rejects(stock.recordMovement(pool, movement.value), { status: 409 });
  assert.equal(pool.state.products[0].quantidade, 2);
  assert.equal(pool.state.movements.length, 1);
});

test('simultaneous stock-outs cannot produce a negative balance', async () => {
  const pool = new MemoryStockPool();
  const id = await stock.createProduct(pool, parsedProduct('10'));
  const makeMovement = () => stock.readMovement({ tempo: '2026-01-01 12:00:00', tipo: 'saida', quantidade: 6, id_produto: id }).value;
  const results = await Promise.allSettled([stock.recordMovement(pool, makeMovement()), stock.recordMovement(pool, makeMovement())]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal(pool.state.products[0].quantidade, 4);
  assert.equal(pool.state.movements.reduce((sum, movement) => sum + (movement.tipo === 'saida' ? movement.quantidade : 0), 0), 6);
});

test('quantity and value inputs respect the PostgreSQL numeric precision', () => {
  assert.ok(stock.readProduct({ nome: 'A', categoria: 'B', quantidade: '1.0001', valor: '1' }).error);
  assert.ok(stock.readProduct({ nome: 'A', categoria: 'B', quantidade: '1', valor: '1.001' }).error);
  assert.ok(stock.readMovement({ tempo: '2026-02-30 12:00:00', tipo: 'entrada', quantidade: 1, id_produto: 1 }).error);
});

test('report date inputs reject impossible dates and inverted periods', () => {
  assert.ok(stock.readDateRange('2026-02-30', '2026-03-01').error);
  assert.ok(stock.readDateRange('2026-03-02', '2026-03-01').error);
  assert.ok(stock.readDateRange('2026-01-01', '2026-02-30').error);
  assert.deepEqual(stock.readDateRange('2026-03-01', '2026-03-02 23:59:59').value, { start: '2026-03-01', end: '2026-03-02' });
});
