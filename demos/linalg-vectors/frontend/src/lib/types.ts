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
export type DatasetModality = "image" | "text";

export interface DatasetOptionApi {
  id: DatasetId;
  displayName: string;
  defaultSplit: DatasetSplit;
  modality: DatasetModality;
}

export interface DatasetsResponse {
  defaultDataset: DatasetId;
  datasets: DatasetOptionApi[];
}

export interface DatasetImageSampleApi {
  index: number;
  label: number;
  labelName?: string;
  pixels: number[];
}

export interface WordCountApi {
  index: number;
  count: number;
  weight?: number;
}

export interface DatasetTextSampleApi {
  index: number;
  label: number;
  labelName?: string;
  rawText: string;
  snippet: string;
  wordCounts: WordCountApi[];
}

export type DatasetSampleApi = DatasetImageSampleApi | DatasetTextSampleApi;

export interface DatasetSamplesResponse {
  source: DatasetId;
  displayName: string;
  split: DatasetSplit;
  modality: DatasetModality;
  imageWidth: number;
  imageHeight: number;
  vectorLength: number;
  totalCount: number;
  vocab?: string[];
  samples: DatasetSampleApi[];
}
