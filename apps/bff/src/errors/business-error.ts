export class BusinessError extends Error {
    constructor(
        public message: string,
        public code: string,
        public statusCode: number = 400,
        // Error payload can be any shape - validated by error code
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public details?: any
    ) {
        super(message);
        this.name = this.constructor.name;
        // Restore prototype chain for proper instanceOf checks in ES5+
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ValidationError extends BusinessError {
    // Validation details can be any shape - typically Zod error format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}

export class NotFoundError extends BusinessError {
    constructor(message: string = 'Resource not found') {
        super(message, 'NOT_FOUND', 404);
    }
}

export class ConflictError extends BusinessError {
    constructor(message: string) {
        super(message, 'CONFLICT', 409);
    }
}

export class UnauthorizedError extends BusinessError {
    constructor(message: string = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
    }
}

export class ForbiddenError extends BusinessError {
    constructor(message: string = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
    }
}
