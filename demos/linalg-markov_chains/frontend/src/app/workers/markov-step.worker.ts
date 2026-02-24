/// <reference lib="webworker" />

import { buildValidationSummary, createFlowAnimation, normalizeTransitionRows } from '../../lib/markov';
import { buildSparseRowMatrix, stepVectorSparse, type SparseRowMatrix } from '../../lib/markov-sparse';
import type {
  StepWorkerErrorMessage,
  StepWorkerRequest,
  StepWorkerResponse,
  StepWorkerStepBatchResultMessage,
  StepWorkerStepResultMessage,
} from '../step-runtime-messages';

let activeMatrixId: number | null = null;
let activeTransitionMatrix: number[][] = [];
let activeSparseMatrix: SparseRowMatrix = buildSparseRowMatrix([]);

self.onmessage = (event: MessageEvent<StepWorkerRequest>) => {
  const message = event.data;

  if (message.type === 'SET_MATRIX') {
    const normalizedMatrix = normalizeTransitionRows(message.transitionMatrix);
    activeMatrixId = message.matrixId;
    activeTransitionMatrix = normalizedMatrix;
    activeSparseMatrix = buildSparseRowMatrix(normalizedMatrix);
    return;
  }

  const requestId = message.requestId;
  if (activeMatrixId === null || activeMatrixId !== message.matrixId) {
    postWorkerError(
      `Matrix cache miss for matrixId=${message.matrixId}; active=${String(activeMatrixId)}.`,
      requestId
    );
    return;
  }

  if (message.currentVector.length !== activeTransitionMatrix.length) {
    postWorkerError(
      `Current vector length ${message.currentVector.length} does not match matrix size ${activeTransitionMatrix.length}.`,
      requestId
    );
    return;
  }

  const validation = buildValidationSummary(
    activeTransitionMatrix,
    message.currentVector,
    message.currentVector
  );
  if (!validation.canStep) {
    postWorkerError(validation.errors[0] ?? 'Cannot compute step for invalid matrix/vector.', requestId);
    return;
  }

  if (message.type === 'COMPUTE_STEP_BATCH') {
    const safeStepCount = Math.max(1, Math.floor(message.stepCount));
    const flowAnimations: StepWorkerStepBatchResultMessage['flowAnimations'] = [];
    const toVectors: StepWorkerStepBatchResultMessage['toVectors'] = [];
    let fromVector = [...message.currentVector];
    for (let stepIndex = 0; stepIndex < safeStepCount; stepIndex += 1) {
      const toVector = stepVectorSparse(fromVector, activeSparseMatrix);
      const flowAnimation = createFlowAnimation(
        message.animationIdStart + stepIndex,
        fromVector,
        toVector,
        activeTransitionMatrix
      );
      toVectors.push(toVector);
      flowAnimations.push(flowAnimation);
      fromVector = toVector;
    }

    const response: StepWorkerStepBatchResultMessage = {
      type: 'STEP_BATCH_RESULT',
      requestId,
      matrixId: message.matrixId,
      toVectors,
      flowAnimations,
    };
    postWorkerResponse(response);
    return;
  }

  const fromVector = [...message.currentVector];
  const toVector = stepVectorSparse(fromVector, activeSparseMatrix);
  const flowAnimation = createFlowAnimation(
    message.animationId,
    fromVector,
    toVector,
    activeTransitionMatrix
  );

  const response: StepWorkerStepResultMessage = {
    type: 'STEP_RESULT',
    requestId,
    matrixId: message.matrixId,
    toVector,
    flowAnimation,
  };
  postWorkerResponse(response);
};

function postWorkerError(message: string, requestId: number | null) {
  const response: StepWorkerErrorMessage = {
    type: 'STEP_ERROR',
    requestId,
    message,
  };
  postWorkerResponse(response);
}

function postWorkerResponse(message: StepWorkerResponse) {
  self.postMessage(message);
}
