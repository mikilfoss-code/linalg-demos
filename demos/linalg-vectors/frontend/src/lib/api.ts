import { createApi, getApiBaseUrl } from "@shared/lib/api";
import { buildError, fail, type Result } from "@shared/lib/result";
import {
  assert,
  isByteVec,
  isNonNegativeInt,
  isString,
  isVec,
  type MnistSampleApi,
  type MnistSamplesResponse,
} from "./types";

const api = createApi();

export { getApiBaseUrl };

export const health = api.health!;
export const matrixApply = api.matrixApply!;
export const eigen = api.eigen!;

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
    typeof data.totalCount === "number" &&
      Number.isInteger(data.totalCount) &&
      data.totalCount > 0,
    "Invalid MNIST total count"
  );
  assert(Array.isArray(data.samples), "Invalid MNIST samples array");
  data.samples.forEach((sample: any) => validateMnistSample(sample, data.imageSize));
  return data as MnistSamplesResponse;
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
  return api.requestJson(
    `/api/v1/mnist/samples?${params.toString()}`,
    { method: "GET" },
    validateMnistSamples
  );
}
