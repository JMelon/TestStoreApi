class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class ServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ServiceError';
    }
}

module.exports = {
    ValidationError,
    ServiceError
};
