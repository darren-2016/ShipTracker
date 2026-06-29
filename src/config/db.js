const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL // e.g., postgres://user:pass@localhost:5432/ship_db
});

module.exports = pool;
