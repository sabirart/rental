'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');
const { csrfGuard } = require('./middleware/csrf');

const tenantRoutes = require('./routes/tenants');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const recycleRoutes = require('./routes/recycle');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// The hosting platform's reverse proxy sits in front of the app: trust exactly
// that many hops so req.ip (rate limiting) and secure-cookie detection are right.
// Set TRUST_PROXY=0 when running without a proxy.
const trustProxy = process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY);
app.set('trust proxy', Number.isNaN(trustProxy) ? 1 : trustProxy);
app.disable('x-powered-by');

/*
 * Content-Security-Policy. All scripts are first-party files (no inline
 * handlers or inline <script>), so script execution is limited to 'self'.
 * Font Awesome is self-hosted under /vendor. Inline styles are still allowed
 * (style attributes and small <style> blocks); that is a much smaller risk than
 * inline script execution.
 */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:', 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://accounts.google.com'],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// ===== CORS (explicit allow-list; same-origin needs no entry) =====
const configuredOrigins = [process.env.CORS_ORIGINS, process.env.CORS_ORIGIN, process.env.ALLOWED_ORIGINS]
  .filter(Boolean).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
if (!isProd) {
  ['http://localhost:5000', 'http://localhost:5001', 'http://127.0.0.1:5000', 'http://127.0.0.1:5001']
    .forEach((o) => { if (!configuredOrigins.includes(o)) configuredOrigins.push(o); });
}
const corsOptions = {
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin)) return callback(null, true); // no Origin = same-origin / non-browser
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  optionsSuccessStatus: 200
};
app.use('/api', cors(corsOptions));

app.use(compression());

const limiter = (max, message) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, error: message } });
app.use('/api/auth', limiter(Number(process.env.AUTH_RATE_LIMIT) || 200, 'Too many attempts. Please try again later.'));
app.use('/api', limiter(Number(process.env.API_RATE_LIMIT) || 600, 'Too many requests. Please slow down.'));

// Body limit: a tenant's photo + documents travel as base64 in one JSON body. The
// frontend caps the raw budget at 20 MB (MAX_TOTAL_UPLOAD_MB in utils.js); base64
// inflates that ~1.33x (~27 MB) plus form fields, hence 28 MB. Keep both in sync.
app.use('/api', express.json({ limit: process.env.BODY_LIMIT || '28mb' }));
app.use('/api', csrfGuard(configuredOrigins));

// ===== Frontend =====
const frontendPath = path.join(__dirname, '..', 'frontend');
const indexFile = path.join(frontendPath, 'index.html');
const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
app.get(['/', '/dashboard.html'], (req, res) => { noCache(res); res.sendFile(indexFile); });
app.use(express.static(frontendPath, {
  etag: true,
  setHeaders(res, file) {
    if (/\.(html|js|css)$/i.test(file)) noCache(res); // revalidate with ETag: instant 304 when unchanged
    else res.setHeader('Cache-Control', 'public, max-age=604800'); // images, icons, fonts
  }
}));

// ===== API =====
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recycle', recycleRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Rental Management API is running', timestamp: new Date().toISOString(), version: process.env.npm_package_version || '1.0.0' });
});
// Readiness: configuration needed for sign-in is present (no external calls).
app.get('/api/ready', (req, res) => {
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET'].filter((k) => !process.env[k]);
  res.status(missing.length ? 503 : 200).json({ status: missing.length ? 'NOT_READY' : 'READY', missing });
});

app.use('/api/*', (req, res) => res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

let server;
function start() {
  if (isProd) {
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((k) => !process.env[k]);
    if (missing.length) console.warn(`WARNING: missing environment variables: ${missing.join(', ')}. Google sign-in will not work until they are set.`);
  }
  server = app.listen(PORT, () => {
    console.log(`Rental Manager listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
  const shutdown = (signal) => () => {
    console.log(`${signal} received: closing HTTP server`);
    if (!server) return process.exit(0);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => { console.error('UNHANDLED REJECTION:', err); });
  process.on('uncaughtException', (err) => { console.error('UNCAUGHT EXCEPTION:', err); if (!server) process.exit(1); server.close(() => process.exit(1)); });
}
if (require.main === module) start();

module.exports = app;
