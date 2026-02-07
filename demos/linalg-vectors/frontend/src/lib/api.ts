import { createApi, getApiBaseUrl } from "@shared/lib/api";
import { buildError, fail, type Result } from "@shared/lib/result";
import {
  assert,
  isByteVec,
  isNonNegativeInt,
  isString,
  type DatasetId,
  type DatasetModality,
  type DatasetOptionApi,
  type DatasetsResponse,
  type DatasetImageSampleApi,
  type DatasetSplit,
  type DatasetSamplesResponse,
  type DatasetTextSampleApi,
  type WordCountApi,
} from "./types";

const api = createApi();

export { getApiBaseUrl };

export const health = api.health!;
export const matrixApply = api.matrixApply!;
export const eigen = api.eigen!;

function isDatasetId(value: unknown): value is DatasetId {
  return isString(value) && value.length > 0;
}

function isDatasetSplit(value: unknown): value is DatasetSplit {
  return value === "train" || value === "test" || value === "all";
}

function isDatasetModality(value: unknown): value is DatasetModality {
  return value === "image" || value === "text";
}

function validateDatasetOption(data: any): DatasetOptionApi {
  assert(data && typeof data === "object", "Invalid dataset option");
  assert(isDatasetId(data.id), "Invalid dataset option id");
  assert(isString(data.displayName), "Invalid dataset option displayName");
  assert(isDatasetSplit(data.defaultSplit), "Invalid dataset option defaultSplit");
  assert(isDatasetModality(data.modality), "Invalid dataset option modality");
  return data as DatasetOptionApi;
}

function validateDatasets(data: any): DatasetsResponse {
  assert(data && typeof data === "object", "Invalid datasets response");
  assert(isDatasetId(data.defaultDataset), "Invalid datasets response defaultDataset");
  assert(Array.isArray(data.datasets), "Invalid datasets response datasets");
  data.datasets.forEach((entry: any) => validateDatasetOption(entry));
  return data as DatasetsResponse;
}

function validateWordCount(data: any, vectorLength: number): WordCountApi {
  assert(data && typeof data === "object", "Invalid word-count entry");
  assert(isNonNegativeInt(data.index), "Invalid word-count index");
  assert(isNonNegativeInt(data.count), "Invalid word-count count");
  if (data.weight !== undefined) {
    assert(typeof data.weight === "number", "Invalid word-count weight");
    assert(data.weight >= 0 && data.weight <= 1, "Invalid word-count weight");
  }
  assert(data.index < vectorLength, "Invalid word-count index");
  return data as WordCountApi;
}

function validateImageSample(data: any, pixelCount: number): DatasetImageSampleApi {
  assert(data && typeof data === "object", "Invalid dataset sample");
  assert(isNonNegativeInt(data.index), "Invalid dataset sample index");
  assert(isNonNegativeInt(data.label), "Invalid dataset sample label");
  if (data.labelName !== undefined) {
    assert(isString(data.labelName), "Invalid dataset sample labelName");
  }
  assert(isByteVec(data.pixels), "Invalid dataset sample pixels");
  assert(data.pixels.length === pixelCount, "Invalid dataset sample pixel length");
  return data as DatasetImageSampleApi;
}

function validateTextSample(data: any, vectorLength: number): DatasetTextSampleApi {
  assert(data && typeof data === "object", "Invalid dataset sample");
  assert(isNonNegativeInt(data.index), "Invalid dataset sample index");
  assert(isNonNegativeInt(data.label), "Invalid dataset sample label");
  if (data.labelName !== undefined) {
    assert(isString(data.labelName), "Invalid dataset sample labelName");
  }
  assert(isString(data.rawText), "Invalid dataset sample rawText");
  assert(isString(data.snippet), "Invalid dataset sample snippet");
  assert(Array.isArray(data.wordCounts), "Invalid dataset sample wordCounts");
  data.wordCounts.forEach((entry: any) => validateWordCount(entry, vectorLength));
  return data as DatasetTextSampleApi;
}

function validateDatasetSamples(data: any): DatasetSamplesResponse {
  assert(data && typeof data === "object", "Invalid dataset response");
  assert(isDatasetId(data.source), "Invalid dataset response source");
  assert(isString(data.displayName), "Invalid dataset response display name");
  assert(isDatasetSplit(data.split), "Invalid dataset response split");
  assert(isDatasetModality(data.modality), "Invalid dataset response modality");
  assert(
    typeof data.imageWidth === "number" &&
      Number.isInteger(data.imageWidth) &&
      data.imageWidth > 0,
    "Invalid dataset image width"
  );
  assert(
    typeof data.imageHeight === "number" &&
      Number.isInteger(data.imageHeight) &&
      data.imageHeight > 0,
    "Invalid dataset image height"
  );
  assert(
    typeof data.vectorLength === "number" &&
      Number.isInteger(data.vectorLength) &&
      data.vectorLength > 0,
    "Invalid dataset vector length"
  );
  assert(
    typeof data.totalCount === "number" &&
      Number.isInteger(data.totalCount) &&
      data.totalCount > 0,
    "Invalid dataset total count"
  );
  assert(Array.isArray(data.samples), "Invalid dataset samples array");

  if (data.modality === "image") {
    const pixelCount = data.imageWidth * data.imageHeight;
    data.samples.forEach((sample: any) => validateImageSample(sample, pixelCount));
  } else {
    assert(Array.isArray(data.vocab), "Invalid dataset vocab");
    data.vocab.forEach((entry: any) => assert(isString(entry), "Invalid dataset vocab entry"));
    assert(data.vocab.length === data.vectorLength, "Invalid dataset vocab length");
    data.samples.forEach((sample: any) => validateTextSample(sample, data.vectorLength));
  }
  return data as DatasetSamplesResponse;
}

/**
 * Fetch available datasets and default selection from the backend.
 *
 * @returns Result containing dataset catalog metadata or an error.
 */
export async function listDatasets(): Promise<Result<DatasetsResponse>> {
  return api.requestJson("/api/v1/datasets", { method: "GET" }, validateDatasets);
}

/**
 * Fetch image samples from the backend.
 *
 * @param dataset - Dataset id to sample from.
 * @param count - Number of samples to request.
 * @param seed - Optional RNG seed for reproducible sampling.
 * @param split - Optional split selector ("train"|"test"|"all").
 * @returns Result containing samples with metadata or an error.
 */
export async function datasetSamples(
  dataset: DatasetId,
  count: number,
  seed?: number,
  split?: "train" | "test" | "all",
  signal?: AbortSignal
): Promise<Result<DatasetSamplesResponse>> {
  if (!isNonNegativeInt(count) || count <= 0) {
    return fail(buildError("count must be a positive integer", 0));
  }

  const params = new URLSearchParams({ dataset, count: String(count) });
  if (split !== undefined) {
    params.set("split", split);
  }

  if (seed !== undefined) {
    if (!isNonNegativeInt(seed)) {
      return fail(buildError("seed must be a non-negative integer", 0));
    }
    params.set("seed", String(seed));
  }

  return api.requestJson(
    `/api/v1/datasets/samples?${params.toString()}`,
    { method: "GET", signal },
    validateDatasetSamples
  );
}
