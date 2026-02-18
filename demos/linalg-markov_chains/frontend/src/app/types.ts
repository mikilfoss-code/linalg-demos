import type { FlowAnimationState, ValidationSummary } from '../lib/markov';

export type MarkovSourceMode = 'manual';

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
};
