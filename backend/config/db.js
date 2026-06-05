const { Pool } = require('pg');
const pool = new Pool({
    user: 'root',
    host: 'cockroachdb',
    database: 'defaultdb',
    port: 26257,
});
module.exports = pool;