import type { FlowAnimationState, ValidationSummary } from '../lib/markov';
import type { EditHighlightTarget, EditSessionState } from './edit-session';

export type MarkovSourceMode = 'manual' | 'dataset';

export type MarkovDatasetId = 'web-google';

export type MarkovDatasetPresetId =
  | 'balanced_instructional'
  | 'community_lens'
  | 'authority_hub_contrast'
  | 'dangling_stress'
  | 'random_baseline';

export type MarkovDatasetLayoutId = 'rank_layered' | 'community_force' | 'radial_anchor';

export type MarkovDatasetPresetInfo = {
  id: MarkovDatasetPresetId;
  label: string;
  description: string;
};

export type MarkovDatasetInfo = {
  id: MarkovDatasetId;
  label: string;
  directed: boolean;
  nodeCount: number;
  edgeCount: number;
};

export type MarkovDatasetExtractionStats = {
  selectedNodeCount: number;
  selectedEdgeCount: number;
  danglingNodeCount: number;
};

export type MarkovDatasetUiState = {
  selectedDatasetId: MarkovDatasetId;
  selectedPresetId: MarkovDatasetPresetId;
  selectedLayoutId: MarkovDatasetLayoutId;
  targetNodeCount: number;
  seed: number | null;
  availableDatasets: MarkovDatasetInfo[];
  availablePresets: MarkovDatasetPresetInfo[];
  isCatalogLoading: boolean;
  isExtracting: boolean;
  activeNodeLabels: string[];
  lastExtractionStats: MarkovDatasetExtractionStats | null;
  error: string | null;
};

export type StepComputeBackend = 'worker' | 'sync-fallback';

export type StepComputeUiState = {
  pending: boolean;
  activeRequestId: number | null;
  activeMatrixId: number | null;
  activeExpectedAnimationId: number | null;
  lastCompletedRequestId: number | null;
  lastBackend: StepComputeBackend | null;
  lastDurationMs: number | null;
  lastError: string | null;
};

/**
 * Purpose: AppState object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type AppState = {
  nodeCount: number;
  transitionMatrix: number[][];
  initialVector: number[];
  currentVector: number[];
  stepCount: number;
  sourceMode: MarkovSourceMode;
  validation: ValidationSummary;
  flowAnimation: FlowAnimationState | null;
  nextAnimationId: number;
  hasPendingMatrixEdits: boolean;
  stepCompute: StepComputeUiState;
  dataset: MarkovDatasetUiState;
  editSession: EditSessionState;
  interaction: {
    hoverTarget: EditHighlightTarget | null;
    selectedTarget: EditHighlightTarget | null;
  };
};
