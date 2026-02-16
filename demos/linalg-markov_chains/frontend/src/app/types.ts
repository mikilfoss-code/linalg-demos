import type { FlowAnimationState, ValidationSummary } from '../lib/markov';

export type MarkovSourceMode = 'manual';

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
};
