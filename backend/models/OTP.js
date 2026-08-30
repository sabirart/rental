// models/OTP.js

const crypto = require('crypto');
const { query, get, run } = require('../config/database');

// How long a caller must wait before a new OTP can be requested for the
// same email + purpose. Without this, register/resend-verification/
// forgot-password could be used to repeatedly email an address the
// requester doesn't own (an "email bomb"), limited only by the generic
// shared IP rate limiter.
const RESEND_COOLDOWN_SECONDS = 60;

class OTP {
    // Same case-normalization as User (see User._normalizeEmail) so an OTP
    // requested/verified with a differently-cased email still matches.
    static _normalizeEmail(email) {
        return typeof email === 'string' ? email.trim().toLowerCase() : email;
    }

    // OTPs are stored hashed (not plaintext) so a database-level read
    // (backup leak, misconfigured connection, etc.) doesn't hand over
    // currently-valid codes. A 6-digit code is already only brute-forceable
    // within its short expiry window regardless, so a fast, unsalted hash
    // is an appropriate, low-cost hardening here (unlike passwords, which
    // use bcrypt in User.js because they're long-lived and much
    // higher-value if leaked).
    static _hash(otp) {
        return crypto.createHash('sha256').update(String(otp)).digest('hex');
    }

    static async create(data) {
        try {
            const { email, otp, type, expiresAt } = data;
            const normalizedEmail = this._normalizeEmail(email);

            await this._checkCooldown(normalizedEmail, type);

            await run(
                `INSERT INTO otps (email, otp, type, expires_at)
                 VALUES (?, ?, ?, ?)`,
                [normalizedEmail, this._hash(otp), type, expiresAt]
            );

            // Opportunistic cleanup - no scheduled job exists in this
            // single-process deployment, so instead of letting expired
            // rows accumulate forever, sweep them out whenever a new OTP
            // is issued (cheap, and keeps the table from growing unbounded).
            this.deleteExpired().catch(err => console.error('OTP cleanup failed:', err.message));
        } catch (error) {
            if (!error.isCooldown) {
                console.error('Error in OTP.create:', error.message);
            }
            throw error;
        }
    }

    // Used by resend-verification / re-login-while-unverified /
    // forgot-password, which all invalidate any previous OTP before issuing
    // a new one (only the most recently issued code should ever work). The
    // cooldown is checked against the OTP being replaced - checking it
    // *before* deleting, so a rapid resend can't dodge the cooldown just
    // because the old row was cleared first.
    static async replace(email, type, otp, expiresAt) {
        try {
            const normalizedEmail = this._normalizeEmail(email);
            await this._checkCooldown(normalizedEmail, type);
            await run('DELETE FROM otps WHERE email = ? AND type = ?', [normalizedEmail, type]);
            await run(
                `INSERT INTO otps (email, otp, type, expires_at) VALUES (?, ?, ?, ?)`,
                [normalizedEmail, this._hash(otp), type, expiresAt]
            );
            this.deleteExpired().catch(err => console.error('OTP cleanup failed:', err.message));
        } catch (error) {
            if (!error.isCooldown) {
                console.error('Error in OTP.replace:', error.message);
            }
            throw error;
        }
    }

    static async _checkCooldown(normalizedEmail, type) {
        const recent = await get(
            `SELECT created_at FROM otps WHERE email = ? AND type = ? ORDER BY created_at DESC LIMIT 1`,
            [normalizedEmail, type]
        );
        if (recent) {
            const secondsSince = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
            if (secondsSince < RESEND_COOLDOWN_SECONDS) {
                const err = new Error(`Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)} seconds before requesting another code`);
                err.isCooldown = true;
                throw err;
            }
        }
    }

    static async findByEmail(email, type) {
        try {
            return await get(
                'SELECT * FROM otps WHERE email = ? AND type = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
                [this._normalizeEmail(email), type]
            );
        } catch (error) {
            console.error('Error in OTP.findByEmail:', error.message);
            throw error;
        }
    }

    // Compares a user-submitted code against the stored (hashed) OTP.
    static matches(storedOtp, submittedOtp) {
        return storedOtp === this._hash(submittedOtp);
    }

    static async deleteByEmail(email, type) {
        try {
            await run('DELETE FROM otps WHERE email = ? AND type = ?', [this._normalizeEmail(email), type]);
        } catch (error) {
            console.error('Error in OTP.deleteByEmail:', error.message);
            throw error;
        }
    }

    static async deleteExpired() {
        try {
            await run('DELETE FROM otps WHERE expires_at < NOW()');
        } catch (error) {
            console.error('Error in OTP.deleteExpired:', error.message);
            throw error;
        }
    }
}

module.exports = OTP;