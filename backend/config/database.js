// config/database.js
//
// MIGRATED FROM SQLITE TO POSTGRESQL (industry-standard managed DB).
//
// Why: the previous SQLite setup wrote its .sqlite file to whatever disk
// Render mounted at DATABASE_PATH. Render's Free web service plan does not
// support persistent disks at all - so that file lived on the container's
// EPHEMERAL filesystem and was wiped every time the free instance spun down
// (after 15 min idle) or redeployed. That is why user data appeared to
// "clear" after re-login: the database itself was being reset on the
// server, not anything to do with the browser or Google.
//
// Fix: use a real managed Postgres database (Neon, Supabase, Render
// Postgres, etc.) reached over the network via DATABASE_URL. Data now lives
// independently of the web service's filesystem/uptime, so it survives
// restarts, redeploys, and free-tier spin-downs.
//
// All model files (models/*.js) only ever call query()/get()/run() with
// '?' placeholders - never the underlying client directly - so this file
// is the ONLY place that needed to change engines.

const { Pool, types } = require('pg');
require('dotenv').config();

// Postgres' BIGINT (used by COUNT(*)) is returned as a JS string by default
// to avoid silent precision loss on huge counts. Nothing in this app counts
// anywhere near Number.MAX_SAFE_INTEGER rows, and several call sites treat
// counts as numbers (e.g. `tenants[0].count > 0`), so we parse BIGINT (OID
// 20) as a plain integer app-wide instead of patching every call site.
types.setTypeParser(20, (val) => parseInt(val, 10));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('FATAL: DATABASE_URL environment variable is not set.');
    console.error('Set it to your Postgres connection string (e.g. from Neon, Supabase, or Render Postgres).');
    process.exit(1);
}

// Most managed Postgres providers (Neon, Supabase, Render) require SSL and
// present a certificate that isn't in Node's default trust store path used
// here; rejectUnauthorized:false is the standard pattern recommended by
// these providers for exactly this case. Only disable SSL entirely for a
// genuinely local/unencrypted dev database.
const useSSL = process.env.DATABASE_SSL !== 'false';

const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    // Errors on idle clients (e.g. a connection dropped by the provider)
    // must not crash the whole server.
    console.error('Unexpected error on idle Postgres client:', err.message);
});

// Converts SQLite-style '?' positional placeholders (used throughout
// models/*.js) into Postgres-style '$1, $2, ...' placeholders, so none of
// the existing model/controller code needed to change.
function toPgSyntax(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
    try {
        const result = await pool.query(toPgSyntax(sql), params);
        return result.rows;
    } catch (err) {
        console.error('Query error:', err.message);
        console.error('SQL:', sql);
        console.error('Params:', params);
        throw err;
    }
}

async function get(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0];
}

async function run(sql, params = []) {
    try {
        const result = await pool.query(toPgSyntax(sql), params);
        return { id: null, changes: result.rowCount };
    } catch (err) {
        console.error('Run error:', err.message);
        console.error('SQL:', sql);
        console.error('Params:', params);
        throw err;
    }
}

// Real transactions: a single dedicated client is checked out of the pool
// so BEGIN/COMMIT/ROLLBACK apply to the same underlying connection (a bare
// pool.query per statement would risk each statement landing on a
// different pooled connection). Not currently called anywhere in the
// codebase, but kept correct for future use.
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const txQuery = async (sql, params = []) => (await client.query(toPgSyntax(sql), params)).rows;
        const txGet = async (sql, params = []) => (await txQuery(sql, params))[0];
        const txRun = async (sql, params = []) => {
            const result = await client.query(toPgSyntax(sql), params);
            return { id: null, changes: result.rowCount };
        };
        const result = await callback({ query: txQuery, get: txGet, run: txRun });
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function tableExists(tableName) {
    const result = await get(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`,
        [tableName]
    );
    return !!result;
}

async function getTableCount(tableName) {
    const result = await get(`SELECT COUNT(*) as count FROM ${tableName}`);
    return result ? result.count : 0;
}

async function createTables() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT,
            google_id TEXT,
            profile_pic TEXT,
            is_verified INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS properties (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            total_rooms INTEGER NOT NULL DEFAULT 0,
            base_rent REAL NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'active',
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
            room_number INTEGER NOT NULL,
            room_name TEXT,
            status TEXT DEFAULT 'available',
            tenant_id TEXT,
            rent_amount REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(property_id, room_number)
        )`,

        `CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            father_name TEXT NOT NULL,
            cnic TEXT NOT NULL,
            location TEXT NOT NULL,
            description TEXT,
            property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
            room_number INTEGER,
            status TEXT DEFAULT 'active',
            profile_pic TEXT,
            documents TEXT,
            mobile_number TEXT,
            advance_payment REAL DEFAULT 0,
            lease_end_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            monthly_rent REAL NOT NULL DEFAULT 0,
            electricity REAL DEFAULT 0,
            gas REAL DEFAULT 0,
            previous_dues REAL DEFAULT 0,
            total_payment REAL NOT NULL DEFAULT 0,
            custom_charges TEXT DEFAULT '[]',
            status TEXT DEFAULT 'unpaid',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS recycle_bin (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            original_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('tenant', 'property')),
            data TEXT NOT NULL,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            notifications_enabled INTEGER DEFAULT 1,
            monthly_reset_day INTEGER DEFAULT 31,
            last_reset_month INTEGER,
            last_reset_year INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS user_sessions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('verify', 'reset')),
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const sql of tables) {
        await pool.query(sql);
    }

    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON tenants(property_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year)',
        'CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON rooms(property_id)',
        'CREATE INDEX IF NOT EXISTS idx_tenants_cnic ON tenants(cnic)',
        'CREATE INDEX IF NOT EXISTS idx_recycle_type ON recycle_bin(type)',
        'CREATE INDEX IF NOT EXISTS idx_recycle_deleted_at ON recycle_bin(deleted_at)',
        'CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_recycle_user_id ON recycle_bin(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)',
        'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email)',
        'CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at)'
    ];

    for (const sql of indexes) {
        await pool.query(sql);
    }

    console.log('All database tables and indexes are in place');
}

// Idempotent "add column if missing" migration, for anyone upgrading an
// existing Postgres database created by an earlier version of this schema.
// Postgres' native `ADD COLUMN IF NOT EXISTS` makes this trivial compared
// to the old SQLite version (which had to manually check PRAGMA table_info
// since SQLite has no IF NOT EXISTS for columns).
async function migrateTables() {
    const alterations = [
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS monthly_rent REAL NOT NULL DEFAULT 0`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS electricity REAL DEFAULT 0`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS gas REAL DEFAULT 0`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS previous_dues REAL DEFAULT 0`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS total_payment REAL NOT NULL DEFAULT 0`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS custom_charges TEXT DEFAULT '[]'`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT`,
        `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mobile_number TEXT`,
        `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS advance_payment REAL DEFAULT 0`,
        `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lease_end_date TEXT`,
        `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rent_amount REAL DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_name TEXT`,
        `ALTER TABLE properties ADD COLUMN IF NOT EXISTS user_id TEXT`,
        `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS user_id TEXT`,
        `ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id TEXT`,
        `ALTER TABLE recycle_bin ADD COLUMN IF NOT EXISTS user_id TEXT`,
    ];

    for (const sql of alterations) {
        try {
            await pool.query(sql);
        } catch (err) {
            console.error(`Migration step failed (${sql}):`, err.message);
        }
    }

    console.log('Migration check complete');
}

async function initDatabase() {
    try {
        // Fail fast and loud if the database is unreachable, rather than
        // starting a server that will 500 on every request.
        await pool.query('SELECT 1');
        console.log('Connected to Postgres successfully');
        await createTables();
        await migrateTables();
    } catch (err) {
        console.error('FATAL: Could not initialize Postgres database:', err.message);
        process.exit(1);
    }
}

initDatabase();

// server.js already owns SIGINT/SIGTERM shutdown (closes the HTTP server
// and calls process.exit). This just makes sure the Postgres pool is
// closed too, without racing that other exit call.
process.on('SIGINT', async () => {
    try {
        await pool.end();
        console.log('Postgres pool closed');
    } catch (err) {
        console.error('Error closing Postgres pool:', err.message);
    }
});

module.exports = {
    pool,
    query,
    get,
    run,
    transaction,
    tableExists,
    getTableCount
};
