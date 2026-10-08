// middleware/auth.js

const UserSession = require('../models/UserSession');
const User = require('../models/User');
const { AppError } = require('./errorHandler');

const authMiddleware = {
    async authenticate(req, res, next) {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            
            if (!token) {
                throw new AppError('Authentication required', 401);
            }
            
            const session = await UserSession.findByToken(token);
            if (!session) {
                throw new AppError('Invalid or expired token', 401);
            }
            
            const user = await User.findById(session.user_id);
            if (!user) {
                throw new AppError('User not found', 401);
            }
            
            req.userId = session.user_id;
            req.userEmail = user.email;
            req.sessionToken = token;
            next();
        } catch (error) {
            next(error);
        }
    },

    async optionalAuth(req, res, next) {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            
            if (token) {
                const session = await UserSession.findByToken(token);
                if (session) {
                    const user = await User.findById(session.user_id);
                    if (user) {
                        req.userId = session.user_id;
                        req.userEmail = user.email;
                        req.sessionToken = token;
                    }
                }
            }
            next();
        } catch (error) {
            next();
        }
    }
};

module.exports = authMiddleware;