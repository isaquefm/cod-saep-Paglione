const crypto = require('node:crypto');

const COOKIE_NAME = 'estoque_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

class AuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthConfigurationError';
    this.status = 503;
  }
}

function getConfig(env = process.env) {
  const username = env.STOCK_ADMIN_USERNAME;
  const password = env.STOCK_ADMIN_PASSWORD;
  const secret = env.SESSION_SECRET;
  const appOrigin = env.APP_ORIGIN;
  if (!username || !password || !secret || !appOrigin) {
    throw new AuthConfigurationError('A autenticação não está configurada. Configure STOCK_ADMIN_USERNAME, STOCK_ADMIN_PASSWORD, SESSION_SECRET e APP_ORIGIN.');
  }
  if (Buffer.byteLength(password, 'utf8') < 12) {
    throw new AuthConfigurationError('STOCK_ADMIN_PASSWORD precisa ter pelo menos 12 bytes.');
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new AuthConfigurationError('SESSION_SECRET precisa ter pelo menos 32 bytes.');
  }
  let parsedOrigin;
  try { parsedOrigin = new URL(appOrigin); } catch {
    throw new AuthConfigurationError('APP_ORIGIN deve ser uma origem absoluta válida.');
  }
  if (parsedOrigin.origin !== appOrigin || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/') {
    throw new AuthConfigurationError('APP_ORIGIN deve conter somente protocolo e domínio, sem caminho.');
  }
  if (env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') {
    throw new AuthConfigurationError('APP_ORIGIN precisa usar HTTPS em produção.');
  }
  return { username, password, secret, appOrigin, secure: env.NODE_ENV === 'production' };
}

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left)).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function validOrigin(origin, config) {
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && safeEqual(origin, config.appOrigin);
  } catch { return false; }
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSession(username, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  const payload = {
    sub: username,
    sid: crypto.randomUUID(),
    csrf: crypto.randomBytes(32).toString('base64url'),
    exp: Math.floor(now / 1000) + SESSION_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { ...payload, token: `${encoded}.${sign(encoded, config.secret)}` };
}

function verifySession(token, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!safeEqual(signature, sign(encoded, config.secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.sub !== config.username || typeof payload.sid !== 'string' || typeof payload.csrf !== 'string' ||
        !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch { return null; }
}

function readCookie(cookieHeader, name = COOKIE_NAME) {
  if (typeof cookieHeader !== 'string') return '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name.toLowerCase()] || headers[name] || '';
}

function makeCookie(token, env = process.env, clear = false) {
  const config = getConfig(env);
  const parts = [`${COOKIE_NAME}=${clear ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (config.secure) parts.push('Secure');
  parts.push(`Max-Age=${clear ? 0 : SESSION_SECONDS}`);
  if (clear) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return parts.join('; ');
}

async function saveSession(pool, session, now = new Date()) {
  await pool.query('DELETE FROM admin_sessions WHERE expires_at <= $1', [now]);
  await pool.query('INSERT INTO admin_sessions (session_id, expires_at) VALUES ($1, $2)', [session.sid, new Date(session.exp * 1000)]);
}

async function sessionIsActive(pool, session, now = new Date()) {
  const result = await pool.query('SELECT 1 FROM admin_sessions WHERE session_id = $1 AND expires_at > $2', [session.sid, now]);
  return result.rowCount > 0;
}

async function login(pool, credentials, origin, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  if (!validOrigin(origin, config)) return { status: 403, body: { error: 'Origem da solicitação inválida.' } };
  const usernameMatches = safeEqual(credentials?.username || '', config.username);
  const passwordMatches = safeEqual(credentials?.password || '', config.password);
  if (!usernameMatches || !passwordMatches) return { status: 401, body: { error: 'Usuário ou senha inválidos.' } };
  const session = createSession(config.username, env, now);
  await saveSession(pool, session, new Date(now));
  return {
    status: 200,
    body: { authenticated: true, csrfToken: session.csrf, expiresAt: session.exp * 1000 },
    cookie: makeCookie(session.token, env)
  };
}

async function currentSession(pool, cookieHeader, env = process.env, now = Date.now()) {
  getConfig(env);
  const session = verifySession(readCookie(cookieHeader), env, now);
  if (!session || !(await sessionIsActive(pool, session, new Date(now)))) return { authenticated: false };
  return { authenticated: true, csrfToken: session.csrf, expiresAt: session.exp * 1000 };
}

function preAuthorize(headers, { write = false } = {}, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  const session = verifySession(readCookie(getHeader(headers, 'cookie')), env, now);
  if (!session) return { error: { status: 401, body: { error: 'Sessão inválida ou expirada. Entre novamente.' } } };
  if (write) {
    const origin = getHeader(headers, 'origin');
    const csrf = getHeader(headers, 'x-csrf-token');
    if (!validOrigin(origin, config) || !csrf || !safeEqual(csrf, session.csrf)) {
      return { error: { status: 403, body: { error: 'A solicitação não passou pela validação de origem e CSRF.' } } };
    }
  }
  return { session };
}

async function authorize(pool, headers, options = {}, env = process.env, now = Date.now()) {
  const result = preAuthorize(headers, options, env, now);
  if (result.error) return result;
  if (!(await sessionIsActive(pool, result.session, new Date(now)))) {
    return { error: { status: 401, body: { error: 'Sessão inválida ou expirada. Entre novamente.' } } };
  }
  return result;
}

async function logout(pool, headers, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  if (!validOrigin(getHeader(headers, 'origin'), config)) return { status: 403, body: { error: 'Origem da solicitação inválida.' } };
  const session = verifySession(readCookie(getHeader(headers, 'cookie')), env, now);
  if (session) {
    const csrf = getHeader(headers, 'x-csrf-token');
    if (!csrf || !safeEqual(csrf, session.csrf)) return { status: 403, body: { error: 'A solicitação não passou pela validação CSRF.' } };
    await pool.query('DELETE FROM admin_sessions WHERE session_id = $1', [session.sid]);
  }
  return { status: 204, cookie: makeCookie('', env, true) };
}

// New role-aware sessions: the environment credential is the sole administrator.
function createSession(username, isAdmin, env = process.env, now = Date.now()) {
  if (typeof isAdmin !== 'boolean') {
    const legacyEnv = isAdmin || process.env;
    const legacyNow = env;
    isAdmin = true;
    env = legacyEnv;
    if (typeof legacyNow === 'number') now = legacyNow;
  }
  const config = getConfig(env);
  const payload = { sub: username, admin: isAdmin === true, sid: crypto.randomUUID(), csrf: crypto.randomBytes(32).toString('base64url'), exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { ...payload, token: `${encoded}.${sign(encoded, config.secret)}` };
}

function verifySession(token, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !safeEqual(parts[1], sign(parts[0], config.secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string' || !/^[a-z0-9._-]{3,64}$/.test(payload.sub) || typeof payload.admin !== 'boolean' ||
        typeof payload.sid !== 'string' || typeof payload.csrf !== 'string' || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    if (payload.admin && payload.sub !== config.username.toLowerCase()) return null;
    return payload;
  } catch { return null; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${crypto.scryptSync(password, salt, 64).toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [algorithm, saltText, digestText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !digestText) return false;
  try {
    const expected = Buffer.from(digestText, 'base64url');
    const actual = crypto.scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

async function login(pool, credentials, origin, env = process.env, now = Date.now()) {
  const config = getConfig(env);
  if (!validOrigin(origin, config)) return { status: 403, body: { error: 'Origem invalida.' } };
  const username = typeof credentials?.username === 'string' ? credentials.username.trim().toLowerCase() : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  let isAdmin = false;
  let authenticated = safeEqual(username, config.username.toLowerCase()) && safeEqual(password, config.password);
  if (authenticated) isAdmin = true;
  else if (/^[a-z0-9._-]{3,64}$/.test(username) && Buffer.byteLength(password, 'utf8') <= 256) {
    const result = await pool.query('SELECT password_hash FROM admin_users WHERE username = $1', [username]);
    authenticated = result.rowCount > 0 && verifyPassword(password, result.rows[0].password_hash);
  }
  if (!authenticated) return { status: 401, body: { error: 'Usuario ou senha invalidos.' } };
  const session = createSession(username, isAdmin, env, now);
  await saveSession(pool, session, new Date(now));
  return { status: 200, body: { authenticated: true, csrfToken: session.csrf, expiresAt: session.exp * 1000, username, isAdmin }, cookie: makeCookie(session.token, env) };
}

async function currentSession(pool, cookieHeader, env = process.env, now = Date.now()) {
  getConfig(env);
  const session = verifySession(readCookie(cookieHeader), env, now);
  if (!session || !(await sessionIsActive(pool, session, new Date(now)))) return { authenticated: false };
  return { authenticated: true, csrfToken: session.csrf, expiresAt: session.exp * 1000, username: session.sub, isAdmin: session.admin };
}

async function authorizeAdmin(pool, headers, { write = false } = {}, env = process.env, now = Date.now()) {
  const result = await authorize(pool, headers, { write }, env, now);
  if (result.error) return result;
  if (!result.session.admin) return { error: { status: 403, body: { error: 'Somente o administrador pode gerenciar usuarios.' } } };
  return result;
}

function validateNewUser(username, password, env = process.env) {
  const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) return { error: 'Use usuario de 3 a 64 caracteres: letras, numeros, ponto, hifen ou sublinhado.' };
  if (normalized === getConfig(env).username.toLowerCase()) return { error: 'Esse usuario e reservado ao administrador.' };
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 256) return { error: 'A senha deve ter entre 12 e 256 bytes.' };
  return { value: { username: normalized, password } };
}

async function listUsers(pool) {
  const result = await pool.query('SELECT username, created_at FROM admin_users ORDER BY username');
  return result.rows;
}

async function createUser(pool, username, password, env = process.env) {
  const parsed = validateNewUser(username, password, env);
  if (parsed.error) return { status: 400, body: { error: parsed.error } };
  try {
    await pool.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', [parsed.value.username, hashPassword(parsed.value.password)]);
    return { status: 201, body: { username: parsed.value.username } };
  } catch (error) {
    if (error.code === '23505') return { status: 409, body: { error: 'Este usuario ja esta cadastrado.' } };
    throw error;
  }
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  AuthConfigurationError,
  getConfig,
  makeCookie,
  readCookie,
  getHeader,
  createSession,
  hashPassword,
  verifyPassword,
  validateNewUser,
  verifySession,
  sessionIsActive,
  saveSession,
  login,
  currentSession,
  preAuthorize,
  authorize,
  authorizeAdmin,
  listUsers,
  createUser,
  logout
};
