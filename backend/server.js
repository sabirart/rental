// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const tenantRoutes = require('./routes/tenants');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const recycleRoutes = require('./routes/recycle');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 5000;

// Render/any reverse proxy sits in front of this app - trust it for correct
// client IPs (used by the rate limiter below) and secure-cookie detection.
app.set('trust proxy', 1);

// Standard security headers (HSTS, no-sniff, frame options, etc).
//  - CSP is left off: the frontend loads third-party scripts (Google
//    Identity Services, cdnjs) that would need explicit allow-listing.
//  - crossOriginResourcePolicy/crossOriginOpenerPolicy are also turned off:
//    their defaults ('same-origin') can silently block API responses from
//    being read by a frontend on a different origin, and can break the
//    Google Sign-In popup's ability to message back to this page - the
//    same class of problem the CORS revert above fixes, just via a
//    different header.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
}));

// ===== CORS =====
// Reverted to fully open CORS (matches the original app's behavior) after
// an origin allow-list here broke real login/API calls whenever the
// frontend and backend weren't on the exact same origin (e.g. frontend
// opened from a different host/port than the backend, or a preview URL
// that wasn't in ALLOWED_ORIGINS) - every request was silently blocked by
// the browser with no clear error. This app authenticates with a Bearer
// token in the Authorization header, not cookies, so there's no CSRF/
// credentialed-cookie risk from opening this back up.
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Rate limiting on auth endpoints - login/register/OTP/password-reset are
// the classic brute-force and email-bombing targets, so they still get a
// tighter limit than the rest of the API, but generous enough that normal
// repeated testing/retries during development can't trip it by accident.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many attempts. Please try again later.' }
});
app.use('/api/auth', authLimiter);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please slow down.' }
});
app.use('/api', apiLimiter);

// Middleware. Tenant/property records can include a small base64 profile
// picture or CNIC image, but 50mb per request was far more than any of that
// needs and made this endpoint an easy target for a memory-exhaustion DoS.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== SERVE FRONTEND FILES =====
const frontendPath = path.join(__dirname, '..', 'frontend');
console.log('Serving frontend from:', frontendPath);

// index.html is the single-page app (marketing site + dashboard in one
// document, see site-controller.js). dashboard.html only ever existed to
// client-side-redirect back to index.html, so serve index.html directly
// here instead of round-tripping through that extra redirect. These are
// registered BEFORE express.static below so they take precedence over the
// literal dashboard.html file still sitting in /frontend (static-serving
// order otherwise means that file would win and this route would never run).
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Serve frontend folder for static files (CSS, JS, HTML)
app.use(express.static(frontendPath));

// ===== API Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recycle', recycleRoutes);
app.use('/api/settings', settingsRoutes);
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Rental Management API is running',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// 404 handler - Only for API routes, not for frontend
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('Rental Management API Server');
    console.log('='.repeat(50));
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Frontend: http://localhost:${PORT}/`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
    server.close(() => {
        process.exit(1);
    });
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    server.close(() => {
        process.exit(1);
    });
});

module.exports = app;
