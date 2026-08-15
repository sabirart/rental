const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const getDbPath = () => {
    if (process.env.DATABASE_PATH) {
        return path.resolve(process.env.DATABASE_PATH);
    }
    const projectRoot = path.resolve(__dirname, '../../');
    const dbPath = path.join(projectRoot, 'database.sqlite');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    return dbPath;
};

const dbPath = getDbPath();

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('FATAL: Error connecting to SQLite:', err.message);
        console.error('Database path attempted:', dbPath);
        process.exit(1);
    }
    console.log('Connected to SQLite database successfully');
    console.log('Database path:', dbPath);
    createTables();
    migrateTables();
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

function createTables() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS properties (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            total_rooms INTEGER NOT NULL DEFAULT 0,
            base_rent REAL NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'active',
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id TEXT,
            room_number INTEGER NOT NULL,
            room_name TEXT,
            status TEXT DEFAULT 'available',
            tenant_id TEXT,
            rent_amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
            UNIQUE(property_id, room_number)
        )`,
        
        `CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            father_name TEXT NOT NULL,
            cnic TEXT NOT NULL UNIQUE,
            location TEXT NOT NULL,
            description TEXT,
            property_id TEXT,
            room_number INTEGER,
            status TEXT DEFAULT 'active',
            profile_pic TEXT,
            documents TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
        )`,
        
        `CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS recycle_bin (
            id TEXT PRIMARY KEY,
            original_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('tenant', 'property')),
            data TEXT NOT NULL,
            deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // AUTH TABLES
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT,
            google_id TEXT,
            profile_pic TEXT,
            is_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('verify', 'reset')),
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    
    let errorCount = 0;
    
    tables.forEach((sql, index) => {
        db.run(sql, (err) => {
            if (err) {
                errorCount++;
                console.error(`Error creating table ${index + 1}:`, err.message);
                console.error('SQL:', sql);
            }
        });
    });
    
    setTimeout(() => {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON tenants(property_id)',
            'CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year)',
            'CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON rooms(property_id)',
            'CREATE INDEX IF NOT EXISTS idx_tenants_cnic ON tenants(cnic)',
            'CREATE INDEX IF NOT EXISTS idx_recycle_type ON recycle_bin(type)',
            'CREATE INDEX IF NOT EXISTS idx_recycle_deleted_at ON recycle_bin(deleted_at)',
            // Auth indexes
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)',
            'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email)',
            'CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at)'
        ];
        
        indexes.forEach(sql => {
            db.run(sql, (err) => {
                if (err) {
                    console.error('Error creating index:', err.message);
                }
            });
        });
        
        if (errorCount === 0) {
            console.log('All database tables created successfully');
        } else {
            console.warn(`Database tables created with ${errorCount} errors`);
        }
    }, 500);
}

function migrateTables() {
    // First, verify we can query the payments table
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'", (err, result) => {
        if (err || !result) {
            console.error('Payments table does not exist, cannot migrate');
            return;
        }
        
        // Get existing columns
        db.all("PRAGMA table_info(payments)", (err, columns) => {
            if (err) {
                console.error('Error checking payments schema:', err.message);
                return;
            }
            
            const existingColumns = columns.map(col => col.name);
            console.log('Existing columns in payments:', existingColumns.join(', '));
            
            // Define columns to add with their SQL type
            const columnsToAdd = [
                { name: 'monthly_rent', sql: 'ALTER TABLE payments ADD COLUMN monthly_rent REAL NOT NULL DEFAULT 0' },
                { name: 'electricity', sql: 'ALTER TABLE payments ADD COLUMN electricity REAL DEFAULT 0' },
                { name: 'gas', sql: 'ALTER TABLE payments ADD COLUMN gas REAL DEFAULT 0' },
                { name: 'previous_dues', sql: 'ALTER TABLE payments ADD COLUMN previous_dues REAL DEFAULT 0' },
                { name: 'total_payment', sql: 'ALTER TABLE payments ADD COLUMN total_payment REAL NOT NULL DEFAULT 0' },
                { name: 'custom_charges', sql: 'ALTER TABLE payments ADD COLUMN custom_charges TEXT DEFAULT \'[]\'' },
                { name: 'notes', sql: 'ALTER TABLE payments ADD COLUMN notes TEXT' }
            ];
            
            let migrationCount = 0;
            
            columnsToAdd.forEach(({ name, sql }) => {
                if (!existingColumns.includes(name)) {
                    db.run(sql, (err) => {
                        if (err) {
                            console.error(`Failed to add column ${name}:`, err.message);
                        } else {
                            console.log(`Added column: ${name}`);
                            migrationCount++;
                        }
                    });
                } else {
                    console.log(`Column ${name} already exists, skipping`);
                }
            });
            
            // Migrate rooms table
            db.all("PRAGMA table_info(rooms)", (err, roomColumns) => {
                if (!err && roomColumns) {
                    const existingRoomColumns = roomColumns.map(col => col.name);
                    
                    if (!existingRoomColumns.includes('rent_amount')) {
                        db.run('ALTER TABLE rooms ADD COLUMN rent_amount REAL DEFAULT 0', (err) => {
                            if (err) console.error('Failed to add rent_amount:', err.message);
                            else console.log('Added column: rent_amount');
                        });
                    }
                    
                    if (!existingRoomColumns.includes('room_name')) {
                        db.run('ALTER TABLE rooms ADD COLUMN room_name TEXT', (err) => {
                            if (err) console.error('Failed to add room_name:', err.message);
                            else console.log('Added column: room_name');
                        });
                    }
                }
            });
            
            setTimeout(() => {
                console.log(`Migration completed. Added ${migrationCount} columns.`);
            }, 1000);
        });
    });
}

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Query error:', err.message);
                console.error('SQL:', sql);
                console.error('Params:', params);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('Get error:', err.message);
                console.error('SQL:', sql);
                console.error('Params:', params);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Run error:', err.message);
                console.error('SQL:', sql);
                console.error('Params:', params);
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

function beginTransaction() {
    return new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function commitTransaction() {
    return new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function rollbackTransaction() {
    return new Promise((resolve, reject) => {
        db.run('ROLLBACK', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function transaction(callback) {
    await beginTransaction();
    try {
        const result = await callback();
        await commitTransaction();
        return result;
    } catch (error) {
        await rollbackTransaction();
        throw error;
    }
}

async function tableExists(tableName) {
    const result = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName]
    );
    return !!result;
}

async function getTableCount(tableName) {
    const result = await get(`SELECT COUNT(*) as count FROM ${tableName}`);
    return result ? result.count : 0;
}

module.exports = { 
    db, 
    query, 
    get, 
    run,
    transaction,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    tableExists,
    getTableCount
};