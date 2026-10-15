# Painel de estoque

Interface Next.js para acompanhar produtos, registrar movimentações e consultar os relatórios disponibilizados pela API Express.

## Executar localmente

1. Configure a conexão com o banco no `.env` da raiz e inicie a API com `npm run dev`. A API usa a porta definida em `PORT` (neste ambiente, `3000`).
2. Em `frontend`, copie `.env.example` para `.env.local` se a API estiver em outra URL.
3. Em `frontend`, execute `npm install` e `npm run dev`.
4. Acesse [http://localhost:3001](http://localhost:3001).

O Next.js encaminha as chamadas para o Express no servidor, evitando configuração de CORS no navegador. A URL padrão da API é `http://localhost:3000`.

## Recursos utilizados

- Produtos: `GET /loja/listar`, `POST /loja/cadastro`, `PUT /loja/atualizar/:id` e `DELETE /loja/excluir/:id`.
- Movimentações: `POST /loja/registro`.
- Resumo por categoria: `GET /loja/categoria`.
- Relatórios: `POST /loja/porcentagem`, `POST /loja/relatorio-periodo` e `POST /loja/maiores-saidas`.

A edição/exclusão usa o `id` da tabela `produtos`; produtos com movimentações referenciadas não podem ser excluídos.
