// Shared MySQL connection pool (mysql2/promise).
// Reads connection settings from the environment (see .env.example).
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campusflow',
  waitForConnections: true,
  // A generous limit: the stress test fires up to 200 concurrent
  // booking attempts, and every attempt holds a connection while it
  // waits on the row lock. Serialization happens in the DB, not here.
  connectionLimit: 20,
  queueLimit: 0,
});

module.exports = pool;
