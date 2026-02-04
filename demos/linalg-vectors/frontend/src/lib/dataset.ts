import { datasetSamples } from "./api";
import { ok, type Result } from "@shared/lib/result";
import { type DatasetId, type DatasetSampleApi, type DatasetSplit } from "./types";

export type DatasetMeta = {
  source: DatasetId;
  displayName: string;
  split: DatasetSplit;
  imageWidth: number;
  imageHeight: number;
  totalCount: number;
};

export type DatasetSample = {
  index: number;
  label: number;
  labelName?: string;
  bytes: Uint8ClampedArray<ArrayBuffer>;
  vector: Float32Array;
};

export type DatasetSampleSet = {
  meta: DatasetMeta;
  samples: DatasetSample[];
};

export const DATASET_SAMPLES_ENDPOINT = "/api/v1/datasets/samples";

/**
 * Load image samples from the backend API.
 *
 * @param dataset - Dataset id to sample from.
 * @param count - Number of samples to request.
 * @param seed - Optional RNG seed for reproducible sampling.
 * @returns Result containing metadata and converted sample payloads.
 */
export async function loadDatasetSamples(
  dataset: DatasetId,
  count: number,
  seed?: number
): Promise<Result<DatasetSampleSet>> {
  const response = await datasetSamples(dataset, count, seed);
  if (!response.ok) {
    return response;
  }

  const meta: DatasetMeta = {
    source: response.value.source,
    displayName: response.value.displayName,
    split: response.value.split,
    imageWidth: response.value.imageWidth,
    imageHeight: response.value.imageHeight,
    totalCount: response.value.totalCount,
  };
  const samples = response.value.samples.map((sample) => normalizeSample(sample));
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
  sample: DatasetSample,
  imageWidth: number,
  imageHeight: number
): ImageData {
  return new ImageData(sample.bytes, imageWidth, imageHeight);
}

function normalizeSample(sample: DatasetSampleApi): DatasetSample {
  const { bytes, vector } = convertPixels(sample.pixels);
  return {
    index: sample.index,
    label: sample.label,
    labelName: sample.labelName,
    bytes,
    vector,
  };
}

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
