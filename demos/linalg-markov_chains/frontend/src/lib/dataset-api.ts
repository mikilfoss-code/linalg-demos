import { createApiClient } from '@shared/lib/api';
import type { Result } from '@shared/lib/result';
import type {
  MarkovDatasetId,
  MarkovDatasetInfo,
  MarkovDatasetPresetId,
  MarkovDatasetPresetInfo,
} from '../app/types';

export type MarkovDatasetCatalogResponse = {
  datasets: MarkovDatasetInfo[];
  presets: MarkovDatasetPresetInfo[];
  defaultDatasetId: MarkovDatasetId;
  defaultPresetId: MarkovDatasetPresetId;
};

export type MarkovDatasetExtractRequest = {
  datasetId: MarkovDatasetId;
  presetId: MarkovDatasetPresetId;
  targetNodeCount: number;
  seed: number | null;
};

export type MarkovDatasetExtractResponse = {
  datasetId: MarkovDatasetId;
  presetId: MarkovDatasetPresetId;
  nodeIds: number[];
  nodeLabels: string[];
  transitionMatrix: number[][];
  initialVector: number[];
  currentVector: number[];
  stats: {
    selectedNodeCount: number;
    selectedEdgeCount: number;
    danglingNodeCount: number;
  };
};

export type MarkovDatasetApi = {
  getCatalog: () => Promise<Result<MarkovDatasetCatalogResponse>>;
  extractSubgraph: (
    request: MarkovDatasetExtractRequest
  ) => Promise<Result<MarkovDatasetExtractResponse>>;
};

/**
 * Create a typed API wrapper for Markov dataset extraction workflows.
 */
export function createMarkovDatasetApi(): MarkovDatasetApi {
  const client = createApiClient();
  return {
    getCatalog() {
      return client.requestJson(
        '/api/v1/markov/datasets',
        { method: 'GET' },
        validateCatalogResponse
      );
    },
    extractSubgraph(request) {
      return client.requestJson(
        `/api/v1/markov/datasets/${request.datasetId}/extract`,
        {
          method: 'POST',
          body: JSON.stringify({
            presetId: request.presetId,
            targetNodeCount: request.targetNodeCount,
            seed: request.seed,
          }),
        },
        validateExtractResponse
      );
    },
  };
}

function validateCatalogResponse(raw: unknown): MarkovDatasetCatalogResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Catalog response must be an object.');
  }
  const record = raw as Record<string, unknown>;
  const datasetsRaw = record.datasets;
  const presetsRaw = record.presets;
  const defaultDatasetId = record.defaultDatasetId;
  const defaultPresetId = record.defaultPresetId;
  if (!Array.isArray(datasetsRaw) || datasetsRaw.length <= 0) {
    throw new Error('Catalog response must include datasets.');
  }
  if (!Array.isArray(presetsRaw) || presetsRaw.length <= 0) {
    throw new Error('Catalog response must include presets.');
  }
  if (!isDatasetId(defaultDatasetId)) {
    throw new Error('Catalog response includes an unsupported default dataset id.');
  }
  if (!isPresetId(defaultPresetId)) {
    throw new Error('Catalog response includes an unsupported default preset id.');
  }

  const datasets = datasetsRaw.map((item) => validateDatasetInfo(item));
  const presets = presetsRaw.map((item) => validatePresetInfo(item));
  return {
    datasets,
    presets,
    defaultDatasetId,
    defaultPresetId,
  };
}

function validateDatasetInfo(raw: unknown): MarkovDatasetInfo {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Dataset entry must be an object.');
  }
  const record = raw as Record<string, unknown>;
  if (!isDatasetId(record.id)) {
    throw new Error('Unsupported dataset id.');
  }
  if (typeof record.label !== 'string' || record.label.length <= 0) {
    throw new Error('Dataset entry label is required.');
  }
  const nodeCount = Number(record.nodeCount);
  const edgeCount = Number(record.edgeCount);
  if (!Number.isFinite(nodeCount) || nodeCount <= 0) {
    throw new Error('Dataset entry nodeCount must be positive.');
  }
  if (!Number.isFinite(edgeCount) || edgeCount <= 0) {
    throw new Error('Dataset entry edgeCount must be positive.');
  }
  return {
    id: record.id,
    label: record.label,
    directed: Boolean(record.directed),
    nodeCount,
    edgeCount,
  };
}

function validatePresetInfo(raw: unknown): MarkovDatasetPresetInfo {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Preset entry must be an object.');
  }
  const record = raw as Record<string, unknown>;
  if (!isPresetId(record.id)) {
    throw new Error('Unsupported preset id.');
  }
  if (typeof record.label !== 'string' || record.label.length <= 0) {
    throw new Error('Preset entry label is required.');
  }
  if (typeof record.description !== 'string') {
    throw new Error('Preset entry description must be a string.');
  }
  return {
    id: record.id,
    label: record.label,
    description: record.description,
  };
}

function validateExtractResponse(raw: unknown): MarkovDatasetExtractResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Extraction response must be an object.');
  }
  const record = raw as Record<string, unknown>;
  if (!isDatasetId(record.datasetId)) {
    throw new Error('Extraction response dataset id is invalid.');
  }
  if (!isPresetId(record.presetId)) {
    throw new Error('Extraction response preset id is invalid.');
  }

  const nodeIds = validateNodeIds(record.nodeIds);
  const nodeLabels = validateNodeLabels(record.nodeLabels, nodeIds.length);
  const transitionMatrix = validateSquareMatrix(record.transitionMatrix, nodeIds.length);
  const initialVector = validateVector(record.initialVector, nodeIds.length);
  const currentVector = validateVector(record.currentVector, nodeIds.length);
  const stats = validateStats(record.stats, nodeIds.length);

  return {
    datasetId: record.datasetId,
    presetId: record.presetId,
    nodeIds,
    nodeLabels,
    transitionMatrix,
    initialVector,
    currentVector,
    stats,
  };
}

function validateNodeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    throw new Error('nodeIds must be an array.');
  }
  const nodeIds = raw.map((value) => Number(value));
  if (nodeIds.length <= 1 || nodeIds.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('nodeIds must contain at least two non-negative integers.');
  }
  return nodeIds;
}

function validateNodeLabels(raw: unknown, size: number): string[] {
  if (!Array.isArray(raw) || raw.length !== size) {
    throw new Error('nodeLabels must be an array aligned to nodeIds.');
  }
  return raw.map((value) => {
    if (typeof value !== 'string') {
      throw new Error('nodeLabels entries must be strings.');
    }
    return value;
  });
}

function validateSquareMatrix(raw: unknown, size: number): number[][] {
  if (!Array.isArray(raw) || raw.length !== size) {
    throw new Error('transitionMatrix must be a square matrix sized to nodeIds.');
  }
  const matrix = raw.map((row) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error('transitionMatrix must be a square matrix sized to nodeIds.');
    }
    return row.map((value) => Number(value));
  });
  matrix.forEach((row) => {
    row.forEach((value) => {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('transitionMatrix entries must be finite non-negative numbers.');
      }
    });
  });
  return matrix;
}

function validateVector(raw: unknown, size: number): number[] {
  if (!Array.isArray(raw) || raw.length !== size) {
    throw new Error('Vector length must match node count.');
  }
  const vector = raw.map((value) => Number(value));
  if (vector.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Vector entries must be finite non-negative numbers.');
  }
  return vector;
}

function validateStats(
  raw: unknown,
  expectedNodeCount: number
): MarkovDatasetExtractResponse['stats'] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('stats must be an object.');
  }
  const record = raw as Record<string, unknown>;
  const selectedNodeCount = Number(record.selectedNodeCount);
  const selectedEdgeCount = Number(record.selectedEdgeCount);
  const danglingNodeCount = Number(record.danglingNodeCount);
  if (!Number.isInteger(selectedNodeCount) || selectedNodeCount !== expectedNodeCount) {
    throw new Error('stats.selectedNodeCount must match node count.');
  }
  if (!Number.isInteger(selectedEdgeCount) || selectedEdgeCount < 0) {
    throw new Error('stats.selectedEdgeCount must be a non-negative integer.');
  }
  if (!Number.isInteger(danglingNodeCount) || danglingNodeCount < 0) {
    throw new Error('stats.danglingNodeCount must be a non-negative integer.');
  }
  return {
    selectedNodeCount,
    selectedEdgeCount,
    danglingNodeCount,
  };
}

function isPresetId(value: unknown): value is MarkovDatasetPresetId {
  return (
    value === 'balanced_instructional' ||
    value === 'community_lens' ||
    value === 'authority_hub_contrast' ||
    value === 'dangling_stress' ||
    value === 'random_baseline'
  );
}

function isDatasetId(value: unknown): value is MarkovDatasetId {
  return value === 'web-google';
}
