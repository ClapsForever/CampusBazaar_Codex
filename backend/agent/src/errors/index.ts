export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "SESSION_NOT_FOUND"
  | "SESSION_FORBIDDEN"
  | "SESSION_BUSY"
  | "IDEMPOTENCY_CONFLICT"
  | "TOOL_INPUT_INVALID"
  | "LISTING_NOT_FOUND"
  | "BACKEND_TIMEOUT"
  | "BACKEND_UNAVAILABLE"
  | "MODEL_API_KEY_MISSING"
  | "MODEL_UNAVAILABLE"
  | "AGENT_TIMEOUT"
  | "TOOL_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly statusCode: number;

  constructor(code: ErrorCode, message: string, options?: { retryable?: boolean; statusCode?: number; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode ?? statusFor(code);
  }
}

function statusFor(code: ErrorCode): number {
  switch (code) {
    case "BAD_REQUEST":
    case "TOOL_INPUT_INVALID":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "SESSION_NOT_FOUND":
    case "LISTING_NOT_FOUND":
      return 404;
    case "SESSION_FORBIDDEN":
      return 403;
    case "SESSION_BUSY":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "MODEL_API_KEY_MISSING":
      return 503;
    case "BACKEND_TIMEOUT":
    case "BACKEND_UNAVAILABLE":
    case "MODEL_UNAVAILABLE":
    case "AGENT_TIMEOUT":
      return 503;
    default:
      return 500;
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) return new AppError("INTERNAL_ERROR", error.message, { cause: error });
  return new AppError("INTERNAL_ERROR", "发生未知错误");
}
