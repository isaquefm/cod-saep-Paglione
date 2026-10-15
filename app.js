const express = require('express');
const app = express();

app.use(express.json());

//Rotas
const lojaRoutes = require('./routes/estoque.js');
app.use('/loja', lojaRoutes);

module.exports = app;