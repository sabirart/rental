// server.js - FIXED CORS for localhost development

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const tenantRoutes = require('./routes/tenants');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const recycleRoutes = require('./routes/recycle');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ===== FIXED CORS CONFIGURATION =====
// Allow all origins for development - THIS WILL FIX YOUR CORS ISSUE
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== SERVE FRONTEND FILES =====
const frontendPath = path.join(__dirname, '..', 'frontend');
console.log('Serving frontend from:', frontendPath);

// Serve frontend folder for static files (CSS, JS, HTML)
app.use(express.static(frontendPath));

// Root route - serve dashboard.html
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

// Also handle /dashboard.html route
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

// ===== API Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recycle', recycleRoutes);

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