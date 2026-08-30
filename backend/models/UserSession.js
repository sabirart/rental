// models/UserSession.js

const { query, get, run } = require('../config/database');

class UserSession {
    static async create(data) {
        try {
            const { userId, token, expiresAt } = data;
            await run(
                `INSERT INTO user_sessions (user_id, token, expires_at)
                 VALUES (?, ?, ?)`,
                [userId, token, expiresAt]
            );
            // No scheduled cleanup job exists in this single-process
            // deployment, so instead of letting expired session rows
            // accumulate forever, sweep them out whenever a new session is
            // created (cheap, fire-and-forget, never blocks the login).
            this.deleteExpired().catch(err => console.error('Session cleanup failed:', err.message));
        } catch (error) {
            console.error('Error in UserSession.create:', error.message);
            throw error;
        }
    }

    static async findByToken(token) {
        try {
            return await get(
                'SELECT * FROM user_sessions WHERE token = ? AND expires_at > NOW()',
                [token]
            );
        } catch (error) {
            console.error('Error in UserSession.findByToken:', error.message);
            throw error;
        }
    }

    static async findByUserId(userId) {
        try {
            return await query(
                'SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
        } catch (error) {
            console.error('Error in UserSession.findByUserId:', error.message);
            throw error;
        }
    }

    static async delete(token) {
        try {
            await run('DELETE FROM user_sessions WHERE token = ?', [token]);
        } catch (error) {
            console.error('Error in UserSession.delete:', error.message);
            throw error;
        }
    }

    static async deleteAllByUserId(userId) {
        try {
            await run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
        } catch (error) {
            console.error('Error in UserSession.deleteAllByUserId:', error.message);
            throw error;
        }
    }

    static async deleteExpired() {
        try {
            await run('DELETE FROM user_sessions WHERE expires_at < NOW()');
        } catch (error) {
            console.error('Error in UserSession.deleteExpired:', error.message);
            throw error;
        }
    }
}

module.exports = UserSession;