const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);

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
