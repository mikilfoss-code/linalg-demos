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

export type DatasetId = string;
export type DatasetSplit = "train" | "test" | "all";

export interface DatasetOptionApi {
  id: DatasetId;
  displayName: string;
  defaultSplit: DatasetSplit;
}

export interface DatasetsResponse {
  defaultDataset: DatasetId;
  datasets: DatasetOptionApi[];
}

export interface DatasetSampleApi {
  index: number;
  label: number;
  labelName?: string;
  pixels: number[];
}

export interface DatasetSamplesResponse {
  source: DatasetId;
  displayName: string;
  split: DatasetSplit;
  imageWidth: number;
  imageHeight: number;
  totalCount: number;
  samples: DatasetSampleApi[];
}
