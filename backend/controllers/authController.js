const User = require('../models/User');
const UserSession = require('../models/UserSession');
const OTP = require('../models/OTP');
const { AppError } = require('../middleware/errorHandler');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
}

function getExpiresAt(days = 7) {
    const date = new Date();
    // NOTE: Date.setDate() truncates fractional days (it expects an integer
    // day-of-month), so passing e.g. 0.0417 (~1 hour) added zero time and
    // made OTPs expire immediately. Using setTime() with a millisecond
    // offset handles fractional days correctly.
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    // Store as "YYYY-MM-DD HH:MM:SS" (UTC) so it compares correctly against
    // Postgres' NOW() in UserSession.findByToken - the database connection
    // must stay on a UTC session timezone (the default for Neon/Supabase/
    // Render Postgres) for this comparison to line up.
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify the transporter config once at startup so a bad/missing
// EMAIL_USER or EMAIL_PASS (e.g. a regular Gmail password instead of a
// 16-character Gmail App Password) shows up immediately in the server
// logs instead of silently failing later on every OTP email.
transporter.verify((error) => {
    if (error) {
        console.error('Email transporter configuration error - OTP emails will NOT be sent:', error.message);
    } else {
        console.log('Email transporter ready - OTP emails will be sent from', process.env.EMAIL_USER);
    }
});

// Previously this swallowed every failure (caught it, logged it, and
// returned false) while every call site ignored that return value - so a
// misconfigured mailer or a rejected address silently produced "OTP sent
// to your email" responses with no email ever sent. Now it throws so the
// caller can surface a real error to the user instead of a false success.
async function sendEmail(to, subject, html) {
    try {
        const info = await transporter.sendMail({
            from: `"Rental Manager" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log('Email sent:', info.messageId, 'to', to);
        return true;
    } catch (error) {
        console.error('Email send error (to ' + to + '):', error.message);
        throw new AppError('Failed to send OTP email. Please double-check the email address and try again in a moment.', 502);
    }
}

// Google OAuth Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authController = {
    // Register with email/password
    async register(req, res, next) {
        try {
            const { name, email, password } = req.body;
            
            if (!name || !email || !password) {
                throw new AppError('Name, email, and password are required', 400);
            }
            
            if (password.length < 6) {
                throw new AppError('Password must be at least 6 characters', 400);
            }
            
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                throw new AppError('Email already registered', 400);
            }
            
            const userId = generateId();
            const user = await User.create({
                id: userId,
                name,
                email,
                password,
                isVerified: false
            });
            
            // Generate and send verification OTP
            const otp = generateOTP();
            const expiresAt = getExpiresAt(0.0417); // 1 hour
            
            await OTP.create({
                email,
                otp,
                type: 'verify',
                expiresAt
            });
            
            await sendEmail(
                email,
                'Verify Your Email - Rental Manager',
                `
                <h2>Welcome to Rental Manager!</h2>
                <p>Please verify your email address by entering the following OTP:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px;">${otp}</h1>
                <p>This OTP will expire in 1 hour.</p>
                <p>If you didn't create an account, please ignore this email.</p>
                `
            );
            
            res.status(201).json({
                success: true,
                data: { userId, email },
                message: 'Registration successful. Please verify your email with the OTP sent.'
            });
        } catch (error) {
            next(error);
        }
    },

    // Verify email with OTP
    async verifyEmail(req, res, next) {
        try {
            const { email, otp } = req.body;
            
            if (!email || !otp) {
                throw new AppError('Email and OTP are required', 400);
            }
            
            const storedOTP = await OTP.findByEmail(email, 'verify');
            if (!storedOTP || storedOTP.otp !== otp) {
                throw new AppError('Invalid or expired OTP', 400);
            }
            
            await User.verifyEmail(email);
            await OTP.deleteByEmail(email, 'verify');
            
            const user = await User.findByEmail(email);
            const token = generateToken(user.id);
            
            await UserSession.create({
                userId: user.id,
                token,
                expiresAt: getExpiresAt(7)
            });
            
            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isVerified: true
                    },
                    token
                },
                message: 'Email verified successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    // Resend verification OTP
    async resendVerification(req, res, next) {
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new AppError('Email is required', 400);
            }
            
            const user = await User.findByEmail(email);
            if (!user) {
                throw new AppError('User not found', 404);
            }
            
            if (user.is_verified === 1) {
                throw new AppError('Email already verified', 400);
            }
            
            const otp = generateOTP();
            const expiresAt = getExpiresAt(0.0417);
            
            await OTP.deleteByEmail(email, 'verify');
            await OTP.create({
                email,
                otp,
                type: 'verify',
                expiresAt
            });
            
            await sendEmail(
                email,
                'Verify Your Email - Rental Manager',
                `
                <h2>Email Verification</h2>
                <p>Your new verification OTP is:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px;">${otp}</h1>
                <p>This OTP will expire in 1 hour.</p>
                `
            );
            
            res.json({
                success: true,
                message: 'New verification OTP sent to your email'
            });
        } catch (error) {
            next(error);
        }
    },

    // Login with email/password
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            
            if (!email || !password) {
                throw new AppError('Email and password are required', 400);
            }
            
            const user = await User.findByEmail(email);
            if (!user) {
                throw new AppError('Invalid email or password', 401);
            }
            
            if (!user.password) {
                throw new AppError('This account uses Google login. Please use Google Sign In.', 401);
            }
            
            const isValid = await User.comparePassword(password, user.password);
            if (!isValid) {
                throw new AppError('Invalid email or password', 401);
            }
            
            if (user.is_verified !== 1) {
                // Generate new OTP
                const otp = generateOTP();
                const expiresAt = getExpiresAt(0.0417);
                
                await OTP.deleteByEmail(email, 'verify');
                await OTP.create({
                    email,
                    otp,
                    type: 'verify',
                    expiresAt
                });
                
                await sendEmail(
                    email,
                    'Verify Your Email - Rental Manager',
                    `
                    <h2>Email Verification Required</h2>
                    <p>Please verify your email to login. Your OTP is:</p>
                    <h1 style="font-size: 32px; letter-spacing: 4px;">${otp}</h1>
                    <p>This OTP will expire in 1 hour.</p>
                    `
                );
                
                throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
            }
            
            // Delete old sessions
            await UserSession.deleteAllByUserId(user.id);
            
            const token = generateToken(user.id);
            await UserSession.create({
                userId: user.id,
                token,
                expiresAt: getExpiresAt(7)
            });
            
            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isVerified: user.is_verified === 1,
                        googleId: user.google_id || null,
                        hasPassword: !!user.password
                    },
                    token
                },
                message: 'Login successful'
            });
        } catch (error) {
            next(error);
        }
    },

    // Google Login
    async googleLogin(req, res, next) {
        try {
            const { token: googleToken } = req.body;
            
            if (!googleToken) {
                throw new AppError('Google token is required', 400);
            }
            
            // FIX: the frontend uses Google's implicit OAuth flow (initTokenClient),
            // which returns an access_token, not an ID token/JWT. verifyIdToken()
            // only accepts ID tokens, so it always failed here. We now validate the
            // access_token by calling Google's userinfo endpoint instead.
            const userInfoResponse = await fetch(
                `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(googleToken)}`
            );
            
            if (!userInfoResponse.ok) {
                throw new AppError('Invalid or expired Google token', 401);
            }
            
            const payload = await userInfoResponse.json();
            const { email, name, picture, sub: googleId } = payload;
            
            if (!email) {
                throw new AppError('Could not retrieve email from Google account', 400);
            }
            
            let user = await User.findByEmail(email);
            
            if (user) {
                if (!user.google_id) {
                    // Update user with google_id
                    const { run } = require('../config/database');
                    await run(
                        'UPDATE users SET google_id = ?, profile_pic = COALESCE(?, profile_pic), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [googleId, picture, user.id]
                    );
                }
            } else {
                // Create new user
                const userId = generateId();
                user = await User.create({
                    id: userId,
                    name: name || email.split('@')[0],
                    email,
                    googleId,
                    isVerified: true,
                    profilePic: picture
                });
            }
            
            // Get fresh user data
            user = await User.findByEmail(email);
            
            // Delete old sessions
            await UserSession.deleteAllByUserId(user.id);
            
            const token = generateToken(user.id);
            await UserSession.create({
                userId: user.id,
                token,
                expiresAt: getExpiresAt(7)
            });
            
            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isVerified: user.is_verified === 1,
                        profilePic: user.profile_pic || null,
                        googleId: user.google_id || null,
                        hasPassword: !!user.password
                    },
                    token
                },
                message: 'Google login successful'
            });
        } catch (error) {
            console.error('Google login error:', error);
            next(new AppError('Google authentication failed: ' + error.message, 401));
        }
    },

    // Forgot password - send OTP
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new AppError('Email is required', 400);
            }
            
            const user = await User.findByEmail(email);
            if (!user) {
                throw new AppError('User not found with this email', 404);
            }
            
            if (user.google_id) {
                throw new AppError('This account uses Google login. Please use Google Sign In.', 400);
            }
            
            const otp = generateOTP();
            const expiresAt = getExpiresAt(0.0417);
            
            await OTP.deleteByEmail(email, 'reset');
            await OTP.create({
                email,
                otp,
                type: 'reset',
                expiresAt
            });
            
            await sendEmail(
                email,
                'Password Reset OTP - Rental Manager',
                `
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password. Enter the following OTP:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px;">${otp}</h1>
                <p>This OTP will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
                `
            );
            
            res.json({
                success: true,
                message: 'OTP sent to your email for password reset'
            });
        } catch (error) {
            next(error);
        }
    },

    // Reset password with OTP
    async resetPassword(req, res, next) {
        try {
            const { email, otp, newPassword } = req.body;
            
            if (!email || !otp || !newPassword) {
                throw new AppError('Email, OTP, and new password are required', 400);
            }
            
            if (newPassword.length < 6) {
                throw new AppError('Password must be at least 6 characters', 400);
            }
            
            const user = await User.findByEmail(email);
            if (!user) {
                throw new AppError('User not found', 404);
            }
            
            const storedOTP = await OTP.findByEmail(email, 'reset');
            if (!storedOTP || storedOTP.otp !== otp) {
                throw new AppError('Invalid or expired OTP', 400);
            }
            
            await User.updatePassword(email, newPassword);
            await OTP.deleteByEmail(email, 'reset');
            
            // Delete all sessions for security
            await UserSession.deleteAllByUserId(user.id);
            
            res.json({
                success: true,
                message: 'Password reset successfully. Please login with your new password.'
            });
        } catch (error) {
            next(error);
        }
    },

    // Logout
    async logout(req, res, next) {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                await UserSession.delete(token);
            }
            
            res.json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    // Get current user
    async me(req, res, next) {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }
            
            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isVerified: user.is_verified === 1,
                        profilePic: user.profile_pic || null,
                        googleId: user.google_id || null,
                        hasPassword: !!user.password,
                        createdAt: user.created_at,
                        updatedAt: user.updated_at
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    },

    // Update user profile
    async updateProfile(req, res, next) {
        try {
            const { name, profilePic } = req.body;
            
            const user = await User.findById(req.userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }
            
            const updatedUser = await User.update(req.userId, {
                name: name || user.name,
                profilePic: profilePic || user.profile_pic
            });
            
            res.json({
                success: true,
                data: {
                    user: {
                        id: updatedUser.id,
                        name: updatedUser.name,
                        email: updatedUser.email,
                        isVerified: updatedUser.is_verified === 1,
                        profilePic: updatedUser.profile_pic || null,
                        googleId: updatedUser.google_id || null,
                        hasPassword: !!updatedUser.password
                    }
                },
                message: 'Profile updated successfully'
            });
        } catch (error) {
            next(error);
        }
    },

// Backend - controllers/authController.js - Change password section

// Change password (authenticated). Also doubles as "create password"
// for accounts that don't have one yet (e.g. a Google-login account
// that has never set a password) - in that case there is nothing to
// verify, so currentPassword is not required.
async changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!newPassword) {
            throw new AppError('New password is required', 400);
        }
        
        if (newPassword.length < 6) {
            throw new AppError('New password must be at least 6 characters', 400);
        }
        
        const user = await User.findByEmail(req.userEmail);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        
        if (user.password) {
            // Account already has a password - this is a real change,
            // so the current password must be verified first.
            if (!currentPassword) {
                throw new AppError('Current password is required', 400);
            }
            const isValid = await User.comparePassword(currentPassword, user.password);
            if (!isValid) {
                throw new AppError('Current password is incorrect', 401);
            }
        }
        // else: no password set yet (Google-only account) - creating
        // the first password needs no current-password verification.
        
        await User.updatePassword(req.userEmail, newPassword);
        
        // Delete all sessions except current
        const token = req.headers.authorization?.split(' ')[1];
        await UserSession.deleteAllByUserId(user.id);
        if (token) {
            await UserSession.create({
                userId: user.id,
                token,
                expiresAt: getExpiresAt(7)
            });
        }
        
        // Return updated user with hasPassword flag
        const updatedUser = await User.findByEmail(req.userEmail);
        res.json({
            success: true,
            data: {
                user: {
                    id: updatedUser.id,
                    name: updatedUser.name,
                    email: updatedUser.email,
                    isVerified: updatedUser.is_verified === 1,
                    profilePic: updatedUser.profile_pic || null,
                    googleId: updatedUser.google_id || null,
                    hasPassword: !!updatedUser.password
                }
            },
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
},
    // Delete account
    async deleteAccount(req, res, next) {
        try {
            const { password } = req.body;
            
            const user = await User.findByEmail(req.userEmail);
            if (!user) {
                throw new AppError('User not found', 404);
            }
            
            if (user.password) {
                const isValid = await User.comparePassword(password, user.password);
                if (!isValid) {
                    throw new AppError('Password is incorrect', 401);
                }
            } else {
                // No password set yet (e.g. Google-login account that never
                // created one) - there is nothing to verify the delete
                // request against, so require the user to create a password
                // first rather than allowing an unverified account deletion.
                throw new AppError('Please create a password for your account before deleting it.', 400);
            }
            
            await UserSession.deleteAllByUserId(user.id);
            await User.delete(user.id);
            
            res.json({
                success: true,
                message: 'Account deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = authController;
