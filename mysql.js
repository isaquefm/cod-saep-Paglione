const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function postgresQuery(client, sql, params, callback) {
    let index = 0;
    let statement = sql.replace(/\?/g, () => `$${++index}`);
    const isInsert = /^\s*INSERT\s+INTO\s+/i.test(statement);
    if (isInsert && !/\bRETURNING\b/i.test(statement)) statement += ' RETURNING id';

    client.query(statement, params || [], (error, result) => {
        if (error) {
            if (error.code === '23505') error.code = 'ER_DUP_ENTRY';
            if (error.code === '23503') error.code = 'ER_ROW_IS_REFERENCED';
            callback(error);
            return;
        }
        if (isInsert) {
            callback(null, { insertId: result.rows[0]?.id, affectedRows: result.rowCount });
        } else if (/^\s*(UPDATE|DELETE)\b/i.test(statement)) {
            callback(null, { affectedRows: result.rowCount });
        } else {
            callback(null, result.rows);
        }
    });
}

module.exports = {
    query(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        postgresQuery(pool, sql, params, callback);
    },
    getConnection(callback) {
        pool.connect((error, client) => {
            if (error) return callback(error);
            callback(null, {
                query(sql, params, done) {
                    if (typeof params === 'function') {
                        done = params;
                        params = [];
                    }
                    postgresQuery(client, sql, params, done);
                },
                beginTransaction(done) { client.query('BEGIN', done); },
                commit(done) { client.query('COMMIT', done); },
                rollback(done) { client.query('ROLLBACK', done); },
                release() { client.release(); }
            });
        });
    },
    on(event, handler) {
        pool.on(event === 'connection' ? 'connect' : event, handler);
    }
};
