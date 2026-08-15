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
            status: 'unpaid',
            notes: 'Partial payment received',
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        }
    ]
};

// Function to get a fresh copy of sample data
function getSampleData() {
    return JSON.parse(JSON.stringify(SAMPLE_DATA));
}

// Function to check if user is in demo/guest mode
function isDemoMode() {
    return !Auth.isAuthenticated && localStorage.getItem('demo_mode') === 'true';
}

// Make available globally
window.SAMPLE_DATA = SAMPLE_DATA;
window.getSampleData = getSampleData;
window.isDemoMode = isDemoMode;