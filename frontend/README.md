# Painel e API de estoque

Este repositório mantém dois caminhos de API e as hospedagens já configuradas:

- **Next.js na Vercel:** o painel usa /api/stock e acessa o PostgreSQL diretamente.
- **Express no Render:** mantém /health e as rotas de estoque sob /loja. O proxy Next.js /api/backend/* encaminha para o endereço configurado em BACKEND_API_URL (ou para http://localhost:3001 no desenvolvimento).

Os dois caminhos usam as mesmas regras de validação e transação para alterações de estoque. Nenhuma rota ou serviço foi removido.

## Configuração local

1. Copie .env.example para .env na raiz do repositório.
2. Preencha DATABASE_URL, STOCK_ADMIN_USERNAME, STOCK_ADMIN_PASSWORD, SESSION_SECRET e APP_ORIGIN.
3. Gere um segredo aleatório com pelo menos 32 bytes. Por exemplo, execute: node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))" e use a saída em SESSION_SECRET. Não reutilize o exemplo nem publique o segredo.
4. Use http://localhost:3000 como APP_ORIGIN no desenvolvimento local.
5. Instale as dependências com npm install e npm install --prefix frontend.
6. Inicie o painel Next.js com npm run dev na raiz e abra http://localhost:3000.
7. Para executar também a API Express localmente, use npm start em outro terminal. Ela usa a porta 3001 por padrão.

O login é administrativo e único; não há cadastro público. A sessão dura oito horas, usa cookie HttpOnly, SameSite=Strict e Secure em produção. As operações de escrita verificam a origem e um token CSRF mantido apenas em memória no frontend.

## Vercel

Preserve frontend como Root Directory e os comandos atuais de build e start do projeto Next.js. Cadastre nas variáveis de ambiente da Vercel:

- DATABASE_URL
- STOCK_ADMIN_USERNAME
- STOCK_ADMIN_PASSWORD
- SESSION_SECRET
- APP_ORIGIN

Defina APP_ORIGIN como a origem HTTPS exata do painel, sem caminho ou barra final, por exemplo https://seu-dominio. Use um segredo aleatório forte em SESSION_SECRET; a mesma chave deve ser usada no Render para que o proxy valide as mesmas sessões. Não coloque credenciais em código ou no Git.

## Render

O serviço Express existente continua usando render.yaml, npm install, npm start, a porta definida por PORT e o health check público /health. Além de DATABASE_URL, cadastre no serviço Render STOCK_ADMIN_USERNAME, STOCK_ADMIN_PASSWORD, SESSION_SECRET e APP_ORIGIN. APP_ORIGIN deve ser a origem pública HTTPS do painel Vercel. Use os mesmos valores administrativos e de sessão da Vercel.

## Sessões e banco de dados

As sessões assinadas ficam em cookie e são registradas em admin_sessions para que o logout invalide a sessão em ambos os serviços. Na inicialização, os serviços criam a tabela e o índice com CREATE TABLE/INDEX IF NOT EXISTS; isso é aditivo e não altera produtos, movimentações ou histórico existente.

Se faltar configuração de autenticação, as rotas protegidas falham fechadas com erro explícito. /health continua público e retorna somente o estado do serviço.

## Validação

- npm test executa os testes nativos do Node para autenticação, CSRF, integridade transacional e datas.
- npm run build --prefix frontend compila o frontend Next.js.
- npm run na raiz não altera os comandos dev e start já existentes.