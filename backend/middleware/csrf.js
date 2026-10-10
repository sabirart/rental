'use strict';
/**
 * Cross-site request forgery guard for state-changing API calls.
 * Cookies are SameSite=Lax (already blocks cross-site POST/PUT/DELETE in
 * modern browsers); this adds an explicit server-side check:
 *   - a present Origin header must be same-origin or an allowed origin
 *   - otherwise Sec-Fetch-Site must not be "cross-site"
 * Non-browser clients (no Origin / Sec-Fetch-Site) are unaffected.
 */
const { AppError } = require('./errorHandler');
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfGuard(allowedOrigins = []) {
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      const own = `${req.protocol}://${req.get('host')}`;
      if (origin === own || allowedOrigins.includes(origin)) return next();
      return next(new AppError('Cross-site request blocked.', 403, 'CSRF_BLOCKED'));
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return next(new AppError('Cross-site request blocked.', 403, 'CSRF_BLOCKED'));
    return next();
  };
}
module.exports = { csrfGuard };
