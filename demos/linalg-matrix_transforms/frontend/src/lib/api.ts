import {
  assert, isMat, isVec,
  type EigenRequest, type EigenResponse,
  type HealthResponse,
  type MatrixApplyRequest, type MatrixApplyResponse
} from "@shared/lib/types";
import { buildError, fail, ok, type Result } from "@shared/lib/result";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve the API base URL for the demo client.
 */
export function getApiBaseUrl(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  if (envBase) {
    return normalizeBaseUrl(envBase);
  }
  // Use same-origin in dev so the Vite proxy can forward API requests.
  const fallback = import.meta.env.DEV ? "" : "http://localhost:8000";
  return normalizeBaseUrl(fallback);
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  validate?: (data: any) => T
): Promise<Result<T>> {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(buildError(`Network error for ${url}: ${message}`, 0));
  }

  const bodyText = await res.text();
  if (!res.ok) {
    return fail(buildError(`HTTP ${res.status} for ${url}`, res.status, bodyText));
  }

  let data: any = null;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(buildError(`Invalid JSON from ${url}: ${message}`, res.status, bodyText));
    }
  }

  if (!validate) {
    return ok(data as T);
  }

  try {
    const value = validate(data);
    return ok(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(buildError(`Invalid response from ${url}: ${message}`, res.status, bodyText));
  }
}

function validateHealth(data: any): HealthResponse {
  assert(data && typeof data.status === "string", "Invalid /health response");
  return data as HealthResponse;
}

function validateMatrixApply(data: any): MatrixApplyResponse {
  assert(data && isVec(data.result), "Invalid matrix/apply response");
  return data as MatrixApplyResponse;
}

function validateEigen(data: any): EigenResponse {
  assert(data && Array.isArray(data.eigenvalues), "Invalid eig response: eigenvalues");
  assert(
    data.eigenvalues.every((x: any) => typeof x === "number"),
    "Invalid eig response: eigenvalues entries"
  );
  assert(isMat(data.eigenvectors), "Invalid eig response: eigenvectors matrix");
  return data as EigenResponse;
}

/**
 * Fetch the backend health check.
 *
 * @returns Result containing the health response or an error.
 */
export async function health(): Promise<Result<HealthResponse>> {
  return requestJson("/health", { method: "GET" }, validateHealth);
}

/**
 * Apply a matrix to a vector using the backend API.
 *
 * @param req - Matrix and vector payload.
 * @returns Result containing the matrix apply response or an error.
 */
export async function matrixApply(req: MatrixApplyRequest): Promise<Result<MatrixApplyResponse>> {
  if (!isMat(req.matrix)) {
    return fail(buildError("matrix must be number[][]", 0));
  }
  if (!isVec(req.vector)) {
    return fail(buildError("vector must be number[]", 0));
  }
  return requestJson(
    "/api/v1/matrix/apply",
    { method: "POST", body: JSON.stringify(req) },
    validateMatrixApply
  );
}

/**
 * Request eigenvalues/eigenvectors from the backend API.
 *
 * @param req - Matrix payload.
 * @returns Result containing the eigen response or an error.
 */
export async function eigen(req: EigenRequest): Promise<Result<EigenResponse>> {
  if (!isMat(req.matrix)) {
    return fail(buildError("matrix must be number[][]", 0));
  }
  return requestJson(
    "/api/v1/matrix/eig",
    { method: "POST", body: JSON.stringify(req) },
    validateEigen
  );
}
