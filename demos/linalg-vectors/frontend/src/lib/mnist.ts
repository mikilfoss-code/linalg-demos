import { mnistSamples } from "./api";
import { ok, type Result } from "@shared/lib/result";
import { type MnistSampleApi } from "./types";

export type MnistMeta = {
  imageSize: number;
  totalCount: number;
  source: string;
  split: string;
};

export type MnistSample = {
  index: number;
  label: number;
  bytes: Uint8ClampedArray<ArrayBuffer>;
  vector: Float32Array;
};

export type MnistSampleSet = {
  meta: MnistMeta;
  samples: MnistSample[];
};

export const MNIST_ENDPOINT = "/api/v1/mnist/samples";

/**
 * Load a fresh sample of MNIST digits from the backend API.
 *
 * @param count - Number of digits to request.
 * @param seed - Optional RNG seed for reproducible sampling.
 * @returns Result containing sample metadata and converted digit payloads.
 */
export async function loadMnistSamples(
  count: number,
  seed?: number
): Promise<Result<MnistSampleSet>> {
  const response = await mnistSamples(count, seed);
  if (!response.ok) {
    return response;
  }

  const meta: MnistMeta = {
    imageSize: response.value.imageSize,
    totalCount: response.value.totalCount,
    source: response.value.source,
    split: response.value.split,
  };
  const samples = response.value.samples.map((sample) => normalizeSample(sample));
  return ok({ meta, samples });
}

/**
 * Convert a digit sample into ImageData for canvas drawing.
 *
 * @param sample - MNIST digit sample.
 * @param size - Width/height of the digit tile.
 * @returns ImageData ready for canvas rendering.
 */
export function toImageData(sample: MnistSample, size: number): ImageData {
  return new ImageData(sample.bytes, size, size);
}

function normalizeSample(sample: MnistSampleApi): MnistSample {
  return {
    index: sample.index,
    label: sample.label,
    bytes: toRgbaBytes(sample.pixels),
    vector: new Float32Array(sample.vector),
  };
}

function toRgbaBytes(pixels: number[]): Uint8ClampedArray<ArrayBuffer> {
  // Expand grayscale pixels into RGBA bytes for ImageData.
  const bytes = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i += 1) {
    const value = pixels[i];
    const offset = i * 4;
    bytes[offset] = value;
    bytes[offset + 1] = value;
    bytes[offset + 2] = value;
    bytes[offset + 3] = 255;
  }
  return bytes;
}
