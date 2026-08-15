// models/OTP.js

const { query, get, run } = require('../config/database');

class OTP {
    static async create(data) {
        try {
            const { email, otp, type, expiresAt } = data;
            await run(
                `INSERT INTO otps (email, otp, type, expires_at)
                 VALUES (?, ?, ?, ?)`,
                [email, otp, type, expiresAt]
            );
        } catch (error) {
            console.error('Error in OTP.create:', error.message);
            throw error;
        }
    }

    static async findByEmail(email, type) {
        try {
            return await get(
                'SELECT * FROM otps WHERE email = ? AND type = ? AND expires_at > datetime("now") ORDER BY created_at DESC LIMIT 1',
                [email, type]
            );
        } catch (error) {
            console.error('Error in OTP.findByEmail:', error.message);
            throw error;
        }
    }

    static async deleteByEmail(email, type) {
        try {
            await run('DELETE FROM otps WHERE email = ? AND type = ?', [email, type]);
        } catch (error) {
            console.error('Error in OTP.deleteByEmail:', error.message);
            throw error;
        }
    }

    static async deleteExpired() {
        try {
            await run('DELETE FROM otps WHERE expires_at < datetime("now")');
        } catch (error) {
            console.error('Error in OTP.deleteExpired:', error.message);
            throw error;
        }
    }
}

module.exports = OTP;