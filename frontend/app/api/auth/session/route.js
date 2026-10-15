import auth from '../../../../lib/auth.cjs';
import { initialize } from '../../../../lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    auth.getConfig();
    const cookie = request.headers.get('cookie') || '';
    if (!auth.readCookie(cookie)) return Response.json({ authenticated: false });
    const database = await initialize();
    return Response.json(await auth.currentSession(database, cookie));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Falha ao consultar sessão administrativa:', error.message);
    return Response.json({ error: status === 503 ? error.message : 'Não foi possível validar a sessão.' }, { status });
  }
}
