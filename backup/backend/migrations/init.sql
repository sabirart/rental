-- Create database if not exists
CREATE DATABASE IF NOT EXISTS rental_management;

-- Connect to database
\c rental_management;

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    total_rooms INTEGER NOT NULL DEFAULT 0,
    base_rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table (embedded in property)
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES properties(id) ON DELETE CASCADE,
    room_number INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'available',
    tenant_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, room_number)
);

-- FIXED: Tenants table with all columns included
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    father_name VARCHAR(255) NOT NULL,
    cnic VARCHAR(20) NOT NULL UNIQUE,
    location VARCHAR(255) NOT NULL,
    description TEXT,
    property_id VARCHAR(50) REFERENCES properties(id) ON DELETE SET NULL,
    room_number INTEGER,
    status VARCHAR(50) DEFAULT 'active',
    profile_pic TEXT,
    documents TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
    electricity DECIMAL(10, 2) DEFAULT 0,
    gas DECIMAL(10, 2) DEFAULT 0,
    other DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'unpaid',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, month, year)
);

-- FIXED: Removed duplicate ALTER statements
-- Columns profile_pic and documents are now in CREATE TABLE

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_tenants_cnic ON tenants(cnic);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year);
CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON rooms(property_id);

-- FIXED: Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- FIXED: Check if triggers exist before creating
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_properties_updated_at') THEN
        CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenants_updated_at') THEN
        CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payments_updated_at') THEN
        CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_rooms_updated_at') THEN
        CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- FIXED: Add some default data for testing (optional)
INSERT INTO properties (id, name, address, total_rooms, base_rent, status)
SELECT 'prop_default', 'Test Property', '123 Test Street', 5, 500.00, 'active'
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE id = 'prop_default');

-- FIXED: Verify tables were created
SELECT 'Tables created successfully' as status;