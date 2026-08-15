// models/User.js

const { query, get, run } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    static async findByEmail(email) {
        try {
            return await get('SELECT * FROM users WHERE email = ?', [email]);
        } catch (error) {
            console.error('Error in User.findByEmail:', error.message);
            throw error;
        }
    }

    static async findById(id) {
        try {
            return await get('SELECT id, name, email, is_verified, google_id, profile_pic, created_at, updated_at FROM users WHERE id = ?', [id]);
        } catch (error) {
            console.error('Error in User.findById:', error.message);
            throw error;
        }
    }

    static async create(data) {
        try {
            const { id, name, email, password, googleId, isVerified = false, profilePic } = data;
            
            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }
            
            await run(
                `INSERT INTO users (id, name, email, password, google_id, is_verified, profile_pic)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, name, email, hashedPassword, googleId || null, isVerified ? 1 : 0, profilePic || null]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in User.create:', error.message);
            throw error;
        }
    }

    static async update(id, data) {
        try {
            const { name, password, isVerified, profilePic } = data;
            
            let updateFields = [];
            const params = [];
            
            if (name !== undefined) {
                updateFields.push('name = ?');
                params.push(name);
            }
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateFields.push('password = ?');
                params.push(hashedPassword);
            }
            if (isVerified !== undefined) {
                updateFields.push('is_verified = ?');
                params.push(isVerified ? 1 : 0);
            }
            if (profilePic !== undefined) {
                updateFields.push('profile_pic = ?');
                params.push(profilePic);
            }
            
            if (updateFields.length === 0) return await this.findById(id);
            
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);
            
            await run(
                `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
                params
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in User.update:', error.message);
            throw error;
        }
    }

    static async updatePassword(email, newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await run(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
                [hashedPassword, email]
            );
        } catch (error) {
            console.error('Error in User.updatePassword:', error.message);
            throw error;
        }
    }

    static async verifyEmail(email) {
        try {
            await run(
                'UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
                [email]
            );
        } catch (error) {
            console.error('Error in User.verifyEmail:', error.message);
            throw error;
        }
    }

    static async comparePassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    static async delete(id) {
        try {
            await run('DELETE FROM users WHERE id = ?', [id]);
        } catch (error) {
            console.error('Error in User.delete:', error.message);
            throw error;
        }
    }

    static async getAll() {
        try {
            return await query('SELECT id, name, email, is_verified, google_id, created_at, updated_at FROM users ORDER BY created_at DESC');
        } catch (error) {
            console.error('Error in User.getAll:', error.message);
            throw error;
        }
    }
}

module.exports = User;