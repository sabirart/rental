// js/sample-data.js
const SAMPLE_DATA = {
    tenants: [
        {
            id: 'tenant_1',
            name: 'Ahmed Khan',
            father_name: 'Mohammad Khan',
            cnic: '12345-1234567-8',
            location: 'Peshawar',
            property_id: 'prop_1',
            room_number: 1,
            status: 'active',
            description: 'Works in IT sector',
            mobile_number: '03001234567',
            advance_payment: 25000,
            profile_pic: 'demo_profile/profile1.png',
            documents: [
                {
                    name: 'CNIC Copy',
                    type: 'image/png',
                    size: 245000,
                    data: 'demo_profile/cnic.png'
                }
            ],
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'tenant_2',
            name: 'Sana Malik',
            father_name: 'Tariq Malik',
            cnic: '23456-2345678-9',
            location: 'Islamabad',
            property_id: 'prop_1',
            room_number: 2,
            status: 'active',
            description: 'University student',
            mobile_number: '03012345678',
            advance_payment: 15000,
            profile_pic: 'demo_profile/profile2.png',
            documents: [
                {
                    name: 'CNIC Copy',
                    type: 'image/png',
                    size: 245000,
                    data: 'demo_profile/cnic.png'
                }
            ],
            created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'tenant_3',
            name: 'Usman Ali',
            father_name: 'Ali Ahmad',
            cnic: '34567-3456789-0',
            location: 'Lahore',
            property_id: 'prop_2',
            room_number: 1,
            status: 'active',
            description: 'Business owner',
            mobile_number: '03213456789',
            advance_payment: 30000,
            profile_pic: 'demo_profile/profile3.png',
            documents: [
                {
                    name: 'CNIC Copy',
                    type: 'image/png',
                    size: 245000,
                    data: 'demo_profile/cnic.png'
                }
            ],
            created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
        }
    ],
    properties: [
        {
            id: 'prop_1',
            name: 'Green Valley Apartments',
            address: '123 Main Street, Islamabad',
            total_rooms: 5,
            base_rent: 25000,
            status: 'active',
            description: 'Family-friendly apartment complex',
            created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'prop_2',
            name: 'Garden Heights',
            address: '456 Park Avenue, Lahore',
            total_rooms: 3,
            base_rent: 18000,
            status: 'active',
            description: 'Luxury living with garden views',
            created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
        }
    ],
    payments: [
        {
            id: 'pay_1',
            tenant_id: 'tenant_1',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            monthly_rent: 25000,
            electricity: 3000,
            gas: 1500,
            previous_dues: 0,
            total_payment: 29500,
            amount_paid: 29500,
            status: 'paid',
            notes: 'Paid on time',
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'pay_2',
            tenant_id: 'tenant_2',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            monthly_rent: 25000,
            electricity: 2500,
            gas: 1200,
            previous_dues: 0,
            total_payment: 28700,
            amount_paid: 28700,
            status: 'paid',
            notes: '',
            created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'pay_3',
            tenant_id: 'tenant_3',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            monthly_rent: 18000,
            electricity: 2000,
            gas: 1000,
            previous_dues: 500,
            total_payment: 21500,
            amount_paid: 12000,
            status: 'partial',
            notes: 'Partial payment received',
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        }
    ]
};

// ===== DEMO SESSION STORE =====
// Holds the "live" demo data for the current page session. It starts as a
// copy of SAMPLE_DATA and is mutated in place whenever the user adds/edits/
// deletes something while in demo mode - so their changes actually stick
// instead of showing a "please login" prompt every time.
// Because this lives only in a JS variable, a browser refresh reloads the
// script and _demoStore goes back to null, so the demo resets to the
// original SAMPLE_DATA automatically. Nothing is written to storage.
let _demoStore = null;

function getDemoStore() {
    if (!_demoStore) {
        _demoStore = JSON.parse(JSON.stringify(SAMPLE_DATA));
    }
    return _demoStore;
}

// Explicitly reset the demo session back to the original sample data
// (used by "Clear all data" in demo mode instead of blocking the user).
function resetDemoStore() {
    _demoStore = JSON.parse(JSON.stringify(SAMPLE_DATA));
    return _demoStore;
}

function generateDemoId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addDemoRecord(collection, record) {
    const store = getDemoStore();
    if (!store[collection]) store[collection] = [];
    store[collection].push(record);
    return record;
}

function updateDemoRecord(collection, id, updates) {
    const store = getDemoStore();
    const list = store[collection] || [];
    const index = list.findIndex(item => item.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    return list[index];
}

function deleteDemoRecord(collection, id) {
    const store = getDemoStore();
    const list = store[collection] || [];
    const index = list.findIndex(item => item.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    return true;
}

// Function to get the current demo data (same live copy every call, so
// edits persist for the session; resets to SAMPLE_DATA on page refresh)
function getSampleData() {
    return getDemoStore();
}

// Function to check if user is in demo/guest mode
// Delegates to Auth.isDemoMode() (single source of truth) to avoid duplicate logic.
function isDemoMode() {
    return window.Auth ? Auth.isDemoMode() : false;
}

// Make available globally
window.SAMPLE_DATA = SAMPLE_DATA;
window.getSampleData = getSampleData;
window.isDemoMode = isDemoMode;
window.getDemoStore = getDemoStore;
window.resetDemoStore = resetDemoStore;
window.generateDemoId = generateDemoId;
window.addDemoRecord = addDemoRecord;
window.updateDemoRecord = updateDemoRecord;
window.deleteDemoRecord = deleteDemoRecord;
