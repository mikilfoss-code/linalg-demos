import {
  assert, isByteVec, isMat, isNonNegativeInt, isString, isVec,
  type EigenRequest, type EigenResponse,
  type HealthResponse,
  type MatrixApplyRequest, type MatrixApplyResponse,
  type MnistSampleApi, type MnistSamplesResponse
} from "./types";
import { buildError, fail, ok, type Result } from "@shared/lib/result";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

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

function validateMnistSample(data: any, imageSize: number): MnistSampleApi {
  assert(data && typeof data === "object", "Invalid MNIST sample");
  assert(isNonNegativeInt(data.index), "Invalid MNIST sample index");
  assert(isNonNegativeInt(data.label), "Invalid MNIST sample label");
  assert(isByteVec(data.pixels), "Invalid MNIST sample pixels");
  assert(
    data.pixels.length === imageSize * imageSize,
    "Invalid MNIST sample pixel length"
  );
  assert(isVec(data.vector), "Invalid MNIST sample vector");
  assert(
    data.vector.length === imageSize * imageSize,
    "Invalid MNIST sample vector length"
  );
  return data as MnistSampleApi;
}

function validateMnistSamples(data: any): MnistSamplesResponse {
  assert(data && typeof data === "object", "Invalid MNIST response");
  assert(isString(data.source), "Invalid MNIST response source");
  assert(isString(data.split), "Invalid MNIST response split");
  assert(
    typeof data.imageSize === "number" && Number.isInteger(data.imageSize) && data.imageSize > 0,
    "Invalid MNIST image size"
  );
  assert(
    typeof data.totalCount === "number" && Number.isInteger(data.totalCount) && data.totalCount > 0,
    "Invalid MNIST total count"
  );
  assert(Array.isArray(data.samples), "Invalid MNIST samples array");
  data.samples.forEach((sample: any) => validateMnistSample(sample, data.imageSize));
  return data as MnistSamplesResponse;
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

/**
 * Fetch MNIST samples from the backend.
 *
 * @param count - Number of samples to request.
 * @param seed - Optional RNG seed for reproducible sampling.
 * @param split - Dataset split to sample from.
 * @returns Result containing MNIST samples with metadata or an error.
 */
export async function mnistSamples(
  count: number,
  seed?: number,
  split: "train" | "test" = "train"
): Promise<Result<MnistSamplesResponse>> {
  if (!isNonNegativeInt(count) || count <= 0) {
    return fail(buildError("count must be a positive integer", 0));
  }
  const params = new URLSearchParams({ count: String(count), split });
  if (seed !== undefined) {
    if (!isNonNegativeInt(seed)) {
      return fail(buildError("seed must be a non-negative integer", 0));
    }
    params.set("seed", String(seed));
  }
  return requestJson(
    `/api/v1/mnist/samples?${params.toString()}`,
    { method: "GET" },
    validateMnistSamples
  );
}
