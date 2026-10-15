const express = require('express');
const auth = require('../frontend/lib/auth.cjs');
const database = require('../database');

const router = express.Router();

function sendError(res, error, fallback) {
    const status = error.status || 500;
    if (status >= 500) console.error(fallback, error.message);
    return res.status(status).json({ error: status === 503 ? error.message : fallback });
}

router.post('/login', async (req, res) => {
    try {
        auth.getConfig();
        const pool = await database.initialize();
        const result = await auth.login(pool, req.body, req.get('origin'));
        if (result.cookie) res.set('Set-Cookie', result.cookie);
        return res.status(result.status).json(result.body);
    } catch (error) {
        return sendError(res, error, 'Não foi possível iniciar a sessão.');
    }
});

router.get('/session', async (req, res) => {
    try {
        auth.getConfig();
        if (!auth.readCookie(req.get('cookie'))) return res.json({ authenticated: false });
        const pool = await database.initialize();
        return res.json(await auth.currentSession(pool, req.get('cookie')));
    } catch (error) {
        return sendError(res, error, 'Não foi possível validar a sessão.');
    }
});

router.post('/logout', async (req, res) => {
    try {
        auth.getConfig();
        const pool = await database.initialize();
        const result = await auth.logout(pool, req.headers);
        if (result.cookie) res.set('Set-Cookie', result.cookie);
        if (result.status === 204) return res.status(204).end();
        return res.status(result.status).json(result.body);
    } catch (error) {
        return sendError(res, error, 'Não foi possível encerrar a sessão.');
    }
});

router.get('/users', async (req, res) => {
    try {
        const pool = await database.initialize();
        const access = await auth.authorizeAdmin(pool, req.headers);
        if (access.error) return res.status(access.error.status).json(access.error.body);
        return res.json(await auth.listUsers(pool));
    } catch (error) {
        return sendError(res, error, 'Nao foi possivel listar usuarios.');
    }
});

router.post('/users', async (req, res) => {
    try {
        const pool = await database.initialize();
        const access = await auth.authorizeAdmin(pool, req.headers, { write: true });
        if (access.error) return res.status(access.error.status).json(access.error.body);
        const result = await auth.createUser(pool, req.body?.username, req.body?.password);
        return res.status(result.status).json(result.body);
    } catch (error) {
        return sendError(res, error, 'Nao foi possivel cadastrar o usuario.');
    }
});

module.exports = router;
