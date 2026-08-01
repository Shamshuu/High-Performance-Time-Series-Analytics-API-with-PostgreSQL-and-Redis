const { Pool } = require('pg');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'analytics_user',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'analytics_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 100, 3000);
  }
});

// Suppress unhandled redis error events in logs if redis is offline during mock tests
redisClient.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Redis error:', err.message);
  }
});

async function query(text, params) {
  const start = Date.now();
  const res = await pgPool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL) {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

async function initDb() {
  const initSqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  await query(sql);
}

module.exports = {
  pgPool,
  redisClient,
  query,
  initDb,
};
