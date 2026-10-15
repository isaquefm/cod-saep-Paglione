const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const database = require('./database');
const auth = require('./frontend/lib/auth.cjs');
const port = Number(process.env.PORT || 3001);

async function start() {
    try {
        auth.getConfig();
        await database.initialize();
        app.listen(port, '0.0.0.0', () => {
            console.log(`API pronta em http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Não foi possível iniciar a API ou preparar o banco:', error.message);
        process.exit(1);
    }
}

start();
