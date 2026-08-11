export class BusinessError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export class NotFoundError extends BusinessError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}

export class ValidationError extends BusinessError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class ConflictError extends BusinessError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class UnauthorizedError extends BusinessError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends BusinessError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message, 403);
  }
}
