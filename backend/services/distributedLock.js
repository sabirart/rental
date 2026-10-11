'use strict';
/**
 * Cross-instance lock for Google Drive JSON mutations.
 *
 * Google Drive does not offer an atomic compare-and-swap for this file. All
 * Rental Manager instances must therefore use the same DATABASE_URL and this
 * lock when more than one instance is running. The lock is session-scoped in
 * PostgreSQL and held until the Drive read/modify/write completes. If the
 * shared lock service is configured but unavailable, writes fail closed.
 */
const crypto = require('crypto');
const { Pool } = require('pg');
const { AppError } = require('../middleware/errorHandler');

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.WRITE_LOCK_POOL_SIZE) > 0 ? Number(process.env.WRITE_LOCK_POOL_SIZE) : 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    });
    pool.on('error', (error) => console.error('Distributed write-lock pool error:', error.message));
  }
  return pool;
}
function lockKey(userId) {
  // A stable signed int64, scoped to this application namespace and user.
  const digest = crypto.createHash('sha256').update(`rental-manager:drive-write:${String(userId)}`).digest();
  return digest.readBigInt64BE(0).toString();
}
async function withDistributedWriteLock(userId, task) {
  const db = getPool();
  if (!db) return task();
  let client;
  let acquired = false;
  const key = lockKey(userId);
  try {
    client = await db.connect();
    await client.query('SELECT pg_advisory_lock($1::bigint)', [key]);
    acquired = true;
    return await task();
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Keep the public error safe, but log the underlying DB failure so the
    // Render logs reveal whether this is a connection, timeout, or SQL issue.
    console.error('[WRITE_LOCK_UNAVAILABLE] Shared database lock failed:', {
      code: error?.code || null,
      message: error?.message || 'Unknown database error',
      name: error?.name || 'Error'
    });
    throw new AppError('Rental Manager could not reach its shared database protection service. No changes were saved. Please retry shortly; if this continues, the site administrator must check the database connection and availability.', 503, 'WRITE_LOCK_UNAVAILABLE');
  } finally {
    if (client) {
      if (acquired) {
        try { await client.query('SELECT pg_advisory_unlock($1::bigint)', [key]); }
        catch (error) { console.error('Could not explicitly release distributed write lock:', error.message); }
      }
      client.release();
    }
  }
}
function resetPoolForTests() {
  if (pool) { const old = pool; pool = null; return old.end(); }
  return Promise.resolve();
}
module.exports = { withDistributedWriteLock, lockKey, resetPoolForTests };
