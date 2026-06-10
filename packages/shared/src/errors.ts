export interface SerializedError {
  code: string;
  message: string;
}

export interface AppErrorOptions {
  code?: string;
  status?: number;
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly isOperational: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.status = options.status ?? 500;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toResponse(): SerializedError {
    return { code: this.code, message: this.message };
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options: { code?: string; cause?: unknown } = {}) {
    super(message, {
      code: options.code ?? 'NOT_FOUND',
      status: 404,
      isOperational: true,
      cause: options.cause,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', options: { code?: string; cause?: unknown } = {}) {
    super(message, {
      code: options.code ?? 'VALIDATION_ERROR',
      status: 400,
      isOperational: true,
      cause: options.cause,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication required',
    options: { code?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: options.code ?? 'UNAUTHORIZED',
      status: 401,
      isOperational: true,
      cause: options.cause,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', options: { code?: string; cause?: unknown } = {}) {
    super(message, {
      code: options.code ?? 'FORBIDDEN',
      status: 403,
      isOperational: true,
      cause: options.cause,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', options: { code?: string; cause?: unknown } = {}) {
    super(message, {
      code: options.code ?? 'CONFLICT',
      status: 409,
      isOperational: true,
      cause: options.cause,
    });
  }
}

// Pure mapping from any thrown value to an HTTP status + response envelope.
// Lives here (not in the app) so it's testable without the framework, and so
// every entrypoint maps errors identically.
export function toErrorResponse(err: unknown): {
  status: number;
  body: { error: SerializedError };
} {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: err.toResponse() } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}
