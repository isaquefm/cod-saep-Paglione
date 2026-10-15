const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

//Rotas
const lojaRoutes = require('./routes/estoque.js');
app.use('/loja', lojaRoutes);

module.exports = app;
