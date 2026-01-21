export type ApiErrorInfo = {
  message: string;
  status: number;
  bodyText?: string;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiErrorInfo };

/**
 * Wrap a successful result.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Wrap a failed result.
 */
export function fail<T>(error: ApiErrorInfo): Result<T> {
  return { ok: false, error };
}

/**
 * Build a structured API error.
 */
export function buildError(message: string, status: number, bodyText?: string): ApiErrorInfo {
  return { message, status, bodyText };
}
