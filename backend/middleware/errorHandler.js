function isDriveStorageQuotaError(err) {
    return Number(err?.code || err?.response?.status) === 403 && (
        (Array.isArray(err?.errors) && err.errors.some(item => item?.reason === 'storageQuotaExceeded')) ||
        (Array.isArray(err?.response?.data?.error?.errors) && err.response.data.error.errors.some(item => item?.reason === 'storageQuotaExceeded')) ||
        /user's Drive storage quota has been exceeded|storageQuotaExceeded/i.test(String(err?.message || ''))
    );
}

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack || err.message); 

    if (isDriveStorageQuotaError(err)) {
        return res.status(403).json({
            success: false,
            code: 'GOOGLE_DRIVE_STORAGE_FULL',
            error: 'Your Google Drive storage is full. Free up space in Google Drive, Gmail, or Google Photos, then sign in again. Rental Manager saves your data in your own Google Drive.',
            timestamp: new Date().toISOString()
        });
    }

    // Body too large (express.json's built-in limit) - give a specific,
    // actionable message instead of the raw body-parser error text.
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            error: 'The uploaded files are too large. Please remove or shrink some files and try again.',
            timestamp: new Date().toISOString()
        });
    }

    if (err.isCooldown) {
        return res.status(429).json({
            success: false,
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }

    const statusCode = err.statusCode || 400;
    const message = err.message || 'Something went wrong';

    res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString()
    });
};

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { errorHandler, AppError };
