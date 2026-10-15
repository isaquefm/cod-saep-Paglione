import auth from '../../../../lib/auth.cjs';
import { initialize } from '../../../../lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    auth.getConfig();
    const database = await initialize();
    const result = await auth.logout(database, request.headers);
    const headers = result.cookie ? { 'Set-Cookie': result.cookie } : undefined;
    return new Response(result.status === 204 ? null : JSON.stringify(result.body), {
      status: result.status,
      headers: result.status === 204 ? headers : { 'Content-Type': 'application/json', ...headers }
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Falha ao encerrar sessão administrativa:', error.message);
    return Response.json({ error: status === 503 ? error.message : 'Não foi possível encerrar a sessão.' }, { status });
  }
}
