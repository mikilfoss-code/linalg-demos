import {
  assert,
  isMat,
  isVec,
  type EigenRequest,
  type EigenResponse,
  type HealthResponse,
  type MatrixApplyRequest,
  type MatrixApplyResponse,
} from "./types";
import { buildError, fail, ok, type Result } from "./result";

export type ApiClient = {
  baseUrl: string;
  requestJson: <T>(
    path: string,
    init: RequestInit,
    validate?: (data: any) => T
  ) => Promise<Result<T>>;
};

export type ApiFeatures = {
  health?: boolean;
  matrixApply?: boolean;
  eigen?: boolean;
};

export type ApiService = ApiClient & {
  health?: () => Promise<Result<HealthResponse>>;
  matrixApply?: (req: MatrixApplyRequest) => Promise<Result<MatrixApplyResponse>>;
  eigen?: (req: EigenRequest) => Promise<Result<EigenResponse>>;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve the API base URL for a demo client.
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

function createRequestJson(baseUrl: string) {
  return async function requestJson<T>(
    path: string,
    init: RequestInit,
    validate?: (data: any) => T
  ): Promise<Result<T>> {
    const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

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
  };
}

export function createApiClient(baseUrl?: string): ApiClient {
  const resolvedBase = normalizeBaseUrl(baseUrl ?? getApiBaseUrl());
  return {
    baseUrl: resolvedBase,
    requestJson: createRequestJson(resolvedBase),
  };
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
 * Create a typed API service. Feature flags allow demos to opt out of unused endpoints.
 */
export function createApi(options: {
  baseUrl?: string;
  client?: ApiClient;
  features?: ApiFeatures;
} = {}): ApiService {
  const client = options.client ?? createApiClient(options.baseUrl);
  const features: Required<ApiFeatures> = {
    health: true,
    matrixApply: true,
    eigen: true,
    ...options.features,
  };

  const api: ApiService = { ...client };

  if (features.health) {
    api.health = () => client.requestJson("/health", { method: "GET" }, validateHealth);
  }
  if (features.matrixApply) {
    api.matrixApply = (req: MatrixApplyRequest) => {
      if (!isMat(req.matrix)) {
        return fail(buildError("matrix must be number[][]", 0));
      }
      if (!isVec(req.vector)) {
        return fail(buildError("vector must be number[]", 0));
      }
      return client.requestJson(
        "/api/v1/matrix/apply",
        { method: "POST", body: JSON.stringify(req) },
        validateMatrixApply
      );
    };
  }
  if (features.eigen) {
    api.eigen = (req: EigenRequest) => {
      if (!isMat(req.matrix)) {
        return fail(buildError("matrix must be number[][]", 0));
      }
      return client.requestJson(
        "/api/v1/matrix/eig",
        { method: "POST", body: JSON.stringify(req) },
        validateEigen
      );
    };
  }

  return api;
}
