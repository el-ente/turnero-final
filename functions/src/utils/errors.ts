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
