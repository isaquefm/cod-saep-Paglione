# Painel e API de estoque

O painel e a API de estoque rodam no mesmo projeto Next.js. A API acessa o PostgreSQL diretamente, sem precisar de uma segunda hospedagem ou de uma URL `BACKEND_API_URL`.

## Executar localmente

1. Crie um único arquivo `.env` na raiz do repositório e informe `DATABASE_URL` do Neon.
2. Instale as dependências com `npm install` e `npm install --prefix frontend`.
3. Inicie com `npm run dev` na raiz.
4. Abra [http://localhost:3000](http://localhost:3000).

Na primeira chamada à API, o sistema cria `produtos` e `movimentacoes` caso não existam. O banco deve aceitar conexões da máquina e da Vercel.

## Publicar na Vercel

Configure `frontend` como Root Directory. Adicione `DATABASE_URL` às variáveis de ambiente do projeto Vercel e faça um novo deploy. O `.env` local não é enviado à Vercel; cadastre a URL como variável privada no painel da Vercel.

Não publique credenciais no repositório. O arquivo `.env` já está ignorado pelo Git.

## API

As rotas usadas pelo painel ficam sob `/api/stock`: produtos, movimentações, totais por categoria e relatórios. As gravações de movimentação são transacionais e impedem saídas maiores que o estoque disponível.
