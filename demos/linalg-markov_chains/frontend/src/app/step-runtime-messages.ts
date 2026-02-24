import type { FlowAnimationState } from '../lib/markov';

/**
 * Worker message: update cached transition matrix for future step requests.
 */
export type StepWorkerSetMatrixMessage = {
  type: 'SET_MATRIX';
  matrixId: number;
  transitionMatrix: number[][];
};

/**
 * Worker message: compute one Markov step and animation payload.
 */
export type StepWorkerComputeStepMessage = {
  type: 'COMPUTE_STEP';
  requestId: number;
  matrixId: number;
  animationId: number;
  currentVector: number[];
};

/**
 * Worker message: compute several consecutive Markov steps.
 */
export type StepWorkerComputeStepBatchMessage = {
  type: 'COMPUTE_STEP_BATCH';
  requestId: number;
  matrixId: number;
  animationIdStart: number;
  currentVector: number[];
  stepCount: number;
};

export type StepWorkerRequest =
  | StepWorkerSetMatrixMessage
  | StepWorkerComputeStepMessage
  | StepWorkerComputeStepBatchMessage;

/**
 * Worker response: successful one-step result.
 */
export type StepWorkerStepResultMessage = {
  type: 'STEP_RESULT';
  requestId: number;
  matrixId: number;
  toVector: number[];
  flowAnimation: FlowAnimationState;
};

/**
 * Worker response: successful multi-step result with one animation payload per step.
 */
export type StepWorkerStepBatchResultMessage = {
  type: 'STEP_BATCH_RESULT';
  requestId: number;
  matrixId: number;
  toVectors: number[][];
  flowAnimations: FlowAnimationState[];
};

/**
 * Worker response: failed compute/matrix request.
 */
export type StepWorkerErrorMessage = {
  type: 'STEP_ERROR';
  requestId: number | null;
  message: string;
};

export type StepWorkerResponse =
  | StepWorkerStepResultMessage
  | StepWorkerStepBatchResultMessage
  | StepWorkerErrorMessage;
