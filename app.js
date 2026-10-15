const express = require('express');
const auth = require('./frontend/lib/auth.cjs');
const database = require('./database');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', require('./routes/auth'));

async function authenticateStockRequest(req, res, next) {
    try {
        const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        const checked = auth.preAuthorize(req.headers, { write });
        if (checked.error) return res.status(checked.error.status).json(checked.error.body);
        const pool = await database.initialize();
        if (!(await auth.sessionIsActive(pool, checked.session))) {
            return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
        }
        req.adminSession = checked.session;
        return next();
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error('Falha ao validar acesso ao estoque:', error.message);
        return res.status(status).json({ error: status === 503 ? error.message : 'Não foi possível validar o acesso ao estoque.' });
    }
}

//Rotas
const lojaRoutes = require('./routes/estoque.js');
app.use('/loja', authenticateStockRequest, lojaRoutes);

module.exports = app;
