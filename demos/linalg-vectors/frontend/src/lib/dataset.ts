import { datasetSamples } from "./api";
import { ok, type Result } from "@shared/lib/result";
import {
  type DatasetId,
  type DatasetImageSampleApi,
  type DatasetModality,
  type DatasetSampleApi,
  type DatasetSplit,
  type DatasetTextSampleApi,
  type WordCountApi,
} from "./types";

export type DatasetMeta = {
  source: DatasetId;
  displayName: string;
  split: DatasetSplit;
  modality: DatasetModality;
  imageWidth: number;
  imageHeight: number;
  vectorLength: number;
  totalCount: number;
  vocab?: string[] | null;
};

export type WordCount = {
  index: number;
  count: number;
  weight: number;
};

export type ImageSample = {
  kind: "image";
  index: number;
  label: number;
  labelName?: string;
  bytes: Uint8ClampedArray<ArrayBuffer>;
  vector: Float32Array;
};

export type TextSample = {
  kind: "text";
  index: number;
  label: number;
  labelName?: string;
  rawText: string;
  snippet: string;
  wordCounts: WordCount[];
};

export type DatasetSample = ImageSample | TextSample;

export type DatasetSampleSet = {
  meta: DatasetMeta;
  samples: DatasetSample[];
};

export const DATASET_SAMPLES_ENDPOINT = "/api/v1/datasets/samples";

/**
 * Load dataset samples from the backend API.
 *
 * @param dataset - Dataset id to sample from.
 * @param count - Number of samples to request.
 * @param seed - Optional RNG seed for reproducible sampling.
 * @param signal - Optional AbortSignal used to cancel an in-flight request.
 * @returns Result containing metadata and converted sample payloads.
 */
export async function loadDatasetSamples(
  dataset: DatasetId,
  count: number,
  seed?: number,
  signal?: AbortSignal
): Promise<Result<DatasetSampleSet>> {
  const response = await datasetSamples(dataset, count, seed, undefined, signal);
  if (!response.ok) {
    return response;
  }

  const meta: DatasetMeta = {
    source: response.value.source,
    displayName: response.value.displayName,
    split: response.value.split,
    modality: response.value.modality,
    imageWidth: response.value.imageWidth,
    imageHeight: response.value.imageHeight,
    vectorLength: response.value.vectorLength,
    totalCount: response.value.totalCount,
    vocab: response.value.vocab ?? undefined,
  };
  const samples = response.value.samples.map((sample) =>
    normalizeSample(sample, response.value.modality)
  );
  return ok({ meta, samples });
}

/**
 * Convert a sample into ImageData for canvas drawing.
 *
 * @param sample - Image sample.
 * @param imageWidth - Image width in pixels.
 * @param imageHeight - Image height in pixels.
 * @returns ImageData ready for canvas rendering.
 */
export function toImageData(
  sample: ImageSample,
  imageWidth: number,
  imageHeight: number
): ImageData {
  return new ImageData(sample.bytes, imageWidth, imageHeight);
}

/**
 * Normalize API sample shape into image/text discriminated union.
 *
 * @param sample - API sample payload.
 * @param modality - Active modality from metadata.
 * @returns Normalized image or text sample.
 */
function normalizeSample(sample: DatasetSampleApi, modality: DatasetModality): DatasetSample {
  if (modality === "image") {
    return normalizeImageSample(sample as DatasetImageSampleApi);
  }
  return normalizeTextSample(sample as DatasetTextSampleApi);
}

/**
 * Normalize image sample payload and precompute pixel/vector buffers.
 *
 * @param sample - Image sample payload from API.
 * @returns Normalized image sample for renderer usage.
 */
function normalizeImageSample(sample: DatasetImageSampleApi): ImageSample {
  const { bytes, vector } = convertPixels(sample.pixels);
  return {
    kind: "image",
    index: sample.index,
    label: sample.label,
    labelName: sample.labelName,
    bytes,
    vector,
  };
}

/**
 * Normalize text sample payload.
 *
 * @param sample - Text sample payload from API.
 * @returns Normalized text sample for renderer usage.
 */
function normalizeTextSample(sample: DatasetTextSampleApi): TextSample {
  const normalized = normalizeWordCounts(sample.wordCounts);
  return {
    kind: "text",
    index: sample.index,
    label: sample.label,
    labelName: sample.labelName,
    rawText: sample.rawText,
    snippet: sample.snippet,
    wordCounts: normalized,
  };
}

/**
 * Normalize optional word-count weights from backend payload.
 *
 * @param entries - Word-count entries from API.
 * @returns Word-count list with guaranteed weight values.
 */
function normalizeWordCounts(entries: WordCountApi[]): WordCount[] {
  if (!entries.length) return [];
  const maxCount = entries.reduce((max, entry) => Math.max(max, entry.count), 0);
  return entries.map((entry) => ({
    index: entry.index,
    count: entry.count,
    weight:
      entry.weight !== undefined
        ? entry.weight
        : maxCount > 0
          ? entry.count / maxCount
          : 0,
  }));
}

/**
 * Convert grayscale pixel bytes into renderable RGBA bytes and normalized vector values.
 *
 * @param pixels - Flattened grayscale bytes from backend payload.
 * @returns RGBA byte buffer and normalized float vector.
 */
function convertPixels(pixels: number[]): {
  bytes: Uint8ClampedArray<ArrayBuffer>;
  vector: Float32Array<ArrayBuffer>;
} {
  // Expand grayscale pixels into RGBA bytes and normalize once for vector math.
  const bytes = new Uint8ClampedArray(pixels.length * 4);
  const vector = new Float32Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 1) {
    const value = pixels[i];
    const offset = i * 4;
    bytes[offset] = value;
    bytes[offset + 1] = value;
    bytes[offset + 2] = value;
    bytes[offset + 3] = 255;
    vector[i] = value / 255;
  }
  return { bytes, vector };
}
