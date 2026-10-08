const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);
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
