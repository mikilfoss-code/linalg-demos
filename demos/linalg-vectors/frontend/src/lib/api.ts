import {
  assert, isMat, isVec,
  type EigenRequest, type EigenResponse,
  type HealthResponse,
  type MatrixApplyRequest, type MatrixApplyResponse
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodyText?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return normalizeBaseUrl(envBase || "http://localhost:8000");
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  validate?: (data: any) => T
): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status} for ${url}`, res.status, bodyText);
  }

  const data = bodyText ? JSON.parse(bodyText) : null;
  return validate ? validate(data) : (data as T);
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

export async function health(): Promise<HealthResponse> {
  return requestJson("/health", { method: "GET" }, validateHealth);
}

export async function matrixApply(req: MatrixApplyRequest): Promise<MatrixApplyResponse> {
  assert(isMat(req.matrix), "matrix must be number[][]");
  assert(isVec(req.vector), "vector must be number[]");
  return requestJson(
    "/api/v1/matrix/apply",
    { method: "POST", body: JSON.stringify(req) },
    validateMatrixApply
  );
}

export async function eigen(req: EigenRequest): Promise<EigenResponse> {
  assert(isMat(req.matrix), "matrix must be number[][]");
  return requestJson(
    "/api/v1/matrix/eig",
    { method: "POST", body: JSON.stringify(req) },
    validateEigen
  );
}
