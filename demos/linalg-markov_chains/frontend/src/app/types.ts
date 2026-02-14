import type { FlowAnimationState, ValidationSummary } from '../lib/markov';
import type { MarkovAnalysisResponse } from '../lib/api';

export type AnalysisState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  result: MarkovAnalysisResponse | null;
  errorMessage: string | null;
};

export type MarkovSourceMode = 'manual';

export type AppState = {
  nodeCount: number;
  transitionMatrix: number[][];
  initialVector: number[];
  currentVector: number[];
  stepCount: number;
  sourceMode: MarkovSourceMode;
  validation: ValidationSummary;
  analysis: AnalysisState;
  flowAnimation: FlowAnimationState | null;
  nextAnimationId: number;
};
