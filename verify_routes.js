import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api'; // Adjust if your server port is different

async function testRoutes() {
    console.log('--- Verification Started ---');

    try {
        // 1. Test Public Route
        console.log('\nTesting Public Route: GET /public/content');
        try {
            const publicRes = await axios.get(`${BASE_URL}/public/content`);
            console.log('✅ Public route worked:', publicRes.status, publicRes.data.success || 'OK');
        } catch (err) {
            console.log('❌ Public route failed:', err.response?.status, err.response?.data);
        }

        // 2. Test Protected Route without token
        console.log('\nTesting Protected Route without token: GET /employee/profile');
        try {
            await axios.get(`${BASE_URL}/employee/profile`);
            console.log('❌ Protected route allowed without token!');
        } catch (err) {
            console.log('✅ Protected route blocked as expected:', err.response?.status, err.response?.data?.message);
        }

        // 3. Test Problematic Router (FandQ) which was likely blocked by router.use in adminForms
        console.log('\nTesting FandQ Route (Admin): GET /admin/faqs');
        try {
            // Even if not authorized, it shouldn't be blocked by a DIFFERENT router's middleware
            // We expect 401/403 but from the right place
            await axios.get(`${BASE_URL}/admin/faqs`);
        } catch (err) {
            console.log('ℹ️ Admin FAQ response:', err.response?.status, err.response?.data?.message);
        }

        console.log('\n--- Verification Finished ---');
    } catch (error) {
        console.error('Test script error:', error.message);
    }
}

testRoutes();
