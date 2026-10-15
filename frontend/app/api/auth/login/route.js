import auth from '../../../../lib/auth.cjs';
import { initialize } from '../../../../lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    let credentials;
    try { credentials = await request.json(); } catch { return Response.json({ error: 'Informe usuário e senha.' }, { status: 400 }); }
    auth.getConfig();
    const database = await initialize();
    const result = await auth.login(database, credentials, request.headers.get('origin'));
    const headers = result.cookie ? { 'Set-Cookie': result.cookie } : undefined;
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Falha no login administrativo:', error.message);
    return Response.json({ error: status === 503 ? error.message : 'Não foi possível iniciar a sessão.' }, { status });
  }
}
