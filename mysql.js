const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.on('connection', () => {
    console.log('Conexão com o banco de dados estabelecida');
});

pool.on('error', (err) => {
    console.error('Erro na conexão com o banco de dados:', err);
});

module.exports = pool;
