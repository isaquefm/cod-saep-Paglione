const backendUrl = (process.env.BACKEND_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function proxyRequest(request, context) {
  try {
    const { path } = await context.params;
    const endpoint = path.map(encodeURIComponent).join('/');
    const url = `${backendUrl}/loja/${endpoint}${new URL(request.url).search}`;
    const headers = {};
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;

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
    console.error('Não foi possível encaminhar a solicitação para a API de estoque:', error);
    return Response.json({ error: 'Não foi possível conectar à API de estoque.' }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
