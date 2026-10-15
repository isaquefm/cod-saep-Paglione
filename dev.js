const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const root = __dirname;
const frontend = path.join(root, 'frontend');
dotenv.config({ path: path.join(root, '.env') });
const port = process.env.FRONTEND_PORT || '3000';

const next = spawn(process.execPath, [
    path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev', '--port', port
], {
    cwd: frontend,
    env: { ...process.env },
    stdio: 'inherit'
});

next.on('error', (error) => {
    console.error('Não foi possível iniciar o painel e a API:', error.message);
    process.exitCode = 1;
});
next.on('exit', (code) => { process.exitCode = code || 0; });
process.on('SIGINT', () => next.kill('SIGINT'));
process.on('SIGTERM', () => next.kill('SIGTERM'));

console.log(`Painel e API: http://localhost:${port}`);
