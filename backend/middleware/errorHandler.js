'use strict';
const crypto = require('crypto');

class AppError extends Error {
  constructor(message, statusCode = 400, code = undefined, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Builds an AppError from a plain model-layer message. Business-rule messages
 * thrown by models become client errors (404 for "not found", otherwise 400);
 * everything that is NOT routed through here or AppError is treated as an
 * unexpected server fault by the error handler (HTTP 500).
 */
function httpError(message) {
  return new AppError(message, /not found/i.test(message) ? 404 : 400);
}

function googleStatus(err) {
  const status = Number(err?.response?.status || err?.status || (typeof err?.code === 'number' ? err.code : NaN));
  return Number.isFinite(status) ? status : null;
}

function googleReasons(err) {
  const list = err?.errors || err?.response?.data?.error?.errors;
  return Array.isArray(list) ? list.map((item) => item?.reason).filter(Boolean) : [];
}

function isDriveStorageQuotaError(err) {
  return (
    googleStatus(err) === 403 &&
    (googleReasons(err).includes('storageQuotaExceeded') ||
      /user's Drive storage quota has been exceeded|storageQuotaExceeded/i.test(String(err?.message || '')))
  );
}

function isGoogleApiError(err) {
  return Boolean(err?.response?.config || err?.response?.data?.error || err?.config?.url || /googleapis/i.test(String(err?.stack || '').slice(0, 400)));
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const timestamp = new Date().toISOString();
  const send = (status, body) => res.status(status).json({ success: false, timestamp, ...body });

  if (isDriveStorageQuotaError(err)) {
    return send(403, {
      code: 'GOOGLE_DRIVE_STORAGE_FULL',
      error:
        'Your Google Drive storage is full. Free up space in Google Drive, Gmail, or Google Photos, then sign in again. Rental Manager saves your data in your own Google Drive.'
    });
  }
  if (err.type === 'entity.too.large') {
    return send(413, { error: 'The uploaded files are too large. Please remove or shrink some files and try again.' });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
    return send(400, { error: 'The request body is not valid JSON.' });
  }
  if (err.message === 'CORS origin not allowed') {
    return send(403, { error: 'This origin is not allowed to call the API.' });
  }
  if (err.isCooldown) {
    return send(429, { error: err.message });
  }
  if (err instanceof AppError) {
    if (err.statusCode >= 500) console.error('AppError:', err.stack || err.message);
    return send(err.statusCode, { error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.details ? { details: err.details } : {}) });
  }

  // Upstream Google failures: map auth problems to 401/403 so the client can
  // prompt for re-consent instead of showing a generic "client error".
  const upstream = googleStatus(err);
  if (isGoogleApiError(err) && (upstream === 401 || upstream === 403)) {
    return send(upstream === 401 ? 401 : 403, {
      code: 'GOOGLE_DRIVE_AUTH',
      error: 'Google Drive access was refused or has expired. Please continue with Google again.'
    });
  }
  if (isGoogleApiError(err) && upstream === 429) {
    return send(503, { code: 'GOOGLE_DRIVE_RATE_LIMITED', error: 'Google Drive is busy right now. Please try again in a moment.' });
  }

  // Anything unclassified is a server fault: log it with a correlation id and
  // return a generic message (never internal wording).
  const errorId = crypto.randomBytes(4).toString('hex');
  console.error(`[${errorId}] Unhandled error on ${req.method} ${req.path}:`, err.stack || err.message || err);
  return send(500, { code: 'INTERNAL_ERROR', errorId, error: `Something went wrong on our side. Please try again. (ref ${errorId})` });
};

module.exports = { errorHandler, AppError, httpError, isDriveStorageQuotaError };
