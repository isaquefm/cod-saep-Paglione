import auth from '../../../../lib/auth.cjs';
import { initialize } from '../../../../lib/database';

const backendUrl = (process.env.BACKEND_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function proxyRequest(request, context) {
  try {
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const checked = auth.preAuthorize(request.headers, { write });
    if (checked.error) return Response.json(checked.error.body, { status: checked.error.status });
    const database = await initialize();
    if (!(await auth.sessionIsActive(database, checked.session))) {
      return Response.json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, { status: 401 });
    }

    const { path } = await context.params;
    const endpoint = path.map(encodeURIComponent).join('/');
    const url = `${backendUrl}/loja/${endpoint}${new URL(request.url).search}`;
    const headers = {};
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;
    const cookie = request.headers.get('cookie');
    const origin = request.headers.get('origin');
    const csrf = request.headers.get('x-csrf-token');
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const options = { method: request.method, headers, cache: 'no-store' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      options.body = await request.text();
    }

    const upstream = await fetch(url, options);
    const body = await upstream.text();
    if (upstream.status === 204) return new Response(null, { status: 204 });
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' }
    });
  } catch (error) {
    if (error.status === 503) return Response.json({ error: error.message }, { status: 503 });
    console.error('Não foi possível encaminhar a solicitação para a API de estoque:', error);
    return Response.json({ error: 'Não foi possível conectar à API de estoque.' }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
