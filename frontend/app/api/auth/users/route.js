import auth from '../../../../lib/auth.cjs';
import { initialize } from '../../../../lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function withAdmin(request, write) {
  const database = await initialize();
  const access = await auth.authorizeAdmin(database, request.headers, { write });
  return { database, access };
}

export async function GET(request) {
  try {
    auth.getConfig();
    const { database, access } = await withAdmin(request, false);
    if (access.error) return Response.json(access.error.body, { status: access.error.status });
    return Response.json(await auth.listUsers(database));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Falha ao listar usuarios:', error.message);
    return Response.json({ error: status === 503 ? error.message : 'Nao foi possivel listar usuarios.' }, { status });
  }
}

export async function POST(request) {
  try {
    auth.getConfig();
    const body = await request.json();
    const { database, access } = await withAdmin(request, true);
    if (access.error) return Response.json(access.error.body, { status: access.error.status });
    const result = await auth.createUser(database, body?.username, body?.password);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Falha ao cadastrar usuario:', error.message);
    return Response.json({ error: status === 503 ? error.message : 'Nao foi possivel cadastrar o usuario.' }, { status });
  }
}
