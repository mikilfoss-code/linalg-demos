export type {
  Vec,
  Mat,
  HealthResponse,
  MatrixApplyRequest,
  MatrixApplyResponse,
  EigenRequest,
  EigenResponse
} from "@shared/lib/types";

export {
  assert,
  isByte,
  isByteVec,
  isFiniteNumber,
  isMat,
  isNonNegativeInt,
  isString,
  isVec
} from "@shared/lib/types";

export interface MnistSampleApi {
  index: number;
  label: number;
  pixels: number[];
  vector: number[];
}

export interface MnistSamplesResponse {
  source: string;
  split: string;
  imageSize: number;
  totalCount: number;
  samples: MnistSampleApi[];
}
