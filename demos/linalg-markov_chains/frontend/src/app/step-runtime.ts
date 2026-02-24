import type { FlowAnimationState } from '../lib/markov';
import type {
  StepWorkerErrorMessage,
  StepWorkerRequest,
  StepWorkerResponse,
  StepWorkerStepBatchResultMessage,
  StepWorkerStepResultMessage,
} from './step-runtime-messages';

type PendingStepRequest = {
  resolve: (value: StepComputeResult) => void;
  reject: (reason?: unknown) => void;
};

export type StepComputeInput = {
  requestId: number;
  transitionMatrix: number[][];
  currentVector: number[];
  animationId: number;
};

export type StepComputeResult = {
  requestId: number;
  matrixId: number;
  toVector: number[];
  flowAnimation: FlowAnimationState;
};

export type StepComputeBatchInput = {
  requestId: number;
  transitionMatrix: number[][];
  currentVector: number[];
  animationIdStart: number;
  stepCount: number;
};

export type StepComputeBatchResult = {
  requestId: number;
  matrixId: number;
  toVectors: number[][];
  flowAnimations: FlowAnimationState[];
};

export type StepRuntime = {
  beginStep: (input: StepComputeInput) => {
    requestId: number;
    matrixId: number;
    promise: Promise<StepComputeResult>;
  };
  beginStepBatch: (input: StepComputeBatchInput) => {
    requestId: number;
    matrixId: number;
    promise: Promise<StepComputeBatchResult>;
  };
  dispose: () => void;
};

/**
 * Create a worker-backed runtime that computes Markov steps off the UI thread.
 */
export function createStepRuntime(): StepRuntime {
  const worker = new Worker(new URL('./workers/markov-step.worker.ts', import.meta.url), {
    type: 'module',
  });
  const pendingByRequestId = new Map<
    number,
    PendingStepRequest & {
      resolveBatch: ((value: StepComputeBatchResult) => void) | null;
    }
  >();
  let disposed = false;
  let lastMatrixRef: number[][] | null = null;
  let lastMatrixId = 0;

  const onWorkerMessage = (event: MessageEvent<StepWorkerResponse>) => {
    const message = event.data;
    if (message.type === 'STEP_RESULT') {
      resolvePendingRequest(message);
      return;
    }
    if (message.type === 'STEP_BATCH_RESULT') {
      resolvePendingBatchRequest(message);
      return;
    }
    rejectPendingRequest(message);
  };

  const onWorkerError = (event: ErrorEvent) => {
    rejectAllPending(event.error ?? new Error(event.message || 'Unknown step worker error.'));
  };

  const onWorkerMessageError = () => {
    rejectAllPending(new Error('Failed to deserialize step worker response.'));
  };

  worker.addEventListener('message', onWorkerMessage);
  worker.addEventListener('error', onWorkerError);
  worker.addEventListener('messageerror', onWorkerMessageError);

  return {
    beginStep(input) {
      if (disposed) {
        throw new Error('Step runtime is disposed.');
      }

      const matrixId = ensureWorkerMatrix(input.transitionMatrix);
      const requestId = input.requestId;

      const request: StepWorkerRequest = {
        type: 'COMPUTE_STEP',
        requestId,
        matrixId,
        animationId: input.animationId,
        currentVector: [...input.currentVector],
      };

      const promise = new Promise<StepComputeResult>((resolve, reject) => {
        pendingByRequestId.set(requestId, { resolve, reject, resolveBatch: null });
        worker.postMessage(request);
      });
      return {
        requestId,
        matrixId,
        promise,
      };
    },
    beginStepBatch(input) {
      if (disposed) {
        throw new Error('Step runtime is disposed.');
      }
      const safeStepCount = Math.max(1, Math.floor(input.stepCount));
      const matrixId = ensureWorkerMatrix(input.transitionMatrix);
      const requestId = input.requestId;

      const request: StepWorkerRequest = {
        type: 'COMPUTE_STEP_BATCH',
        requestId,
        matrixId,
        animationIdStart: input.animationIdStart,
        currentVector: [...input.currentVector],
        stepCount: safeStepCount,
      };

      const promise = new Promise<StepComputeBatchResult>((resolveBatch, reject) => {
        pendingByRequestId.set(requestId, {
          resolve: (_value) => {
            // single-step resolver not used for batch requests.
            void _value;
          },
          reject,
          resolveBatch,
        });
        worker.postMessage(request);
      });
      return {
        requestId,
        matrixId,
        promise,
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      worker.removeEventListener('message', onWorkerMessage);
      worker.removeEventListener('error', onWorkerError);
      worker.removeEventListener('messageerror', onWorkerMessageError);
      worker.terminate();
      rejectAllPending(new Error('Step runtime disposed before response was received.'));
      pendingByRequestId.clear();
    },
  };

  function ensureWorkerMatrix(matrix: number[][]): number {
    if (lastMatrixRef === matrix) {
      return lastMatrixId;
    }
    lastMatrixRef = matrix;
    lastMatrixId += 1;
    const request: StepWorkerRequest = {
      type: 'SET_MATRIX',
      matrixId: lastMatrixId,
      transitionMatrix: matrix,
    };
    worker.postMessage(request);
    return lastMatrixId;
  }

  function resolvePendingRequest(message: StepWorkerStepResultMessage) {
    const pending = pendingByRequestId.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingByRequestId.delete(message.requestId);
    if (pending.resolveBatch) {
      pending.reject(new Error('Received single-step result for a pending batch request.'));
      return;
    }
    pending.resolve({
      requestId: message.requestId,
      matrixId: message.matrixId,
      toVector: message.toVector,
      flowAnimation: message.flowAnimation,
    });
  }

  function resolvePendingBatchRequest(message: StepWorkerStepBatchResultMessage) {
    const pending = pendingByRequestId.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingByRequestId.delete(message.requestId);
    if (!pending.resolveBatch) {
      pending.reject(new Error('Received batch result for a pending single-step request.'));
      return;
    }
    pending.resolveBatch({
      requestId: message.requestId,
      matrixId: message.matrixId,
      toVectors: message.toVectors,
      flowAnimations: message.flowAnimations,
    });
  }

  function rejectPendingRequest(message: StepWorkerErrorMessage) {
    if (message.requestId === null) {
      rejectAllPending(new Error(message.message));
      return;
    }
    const pending = pendingByRequestId.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingByRequestId.delete(message.requestId);
    pending.reject(new Error(message.message));
  }

  function rejectAllPending(error: unknown) {
    pendingByRequestId.forEach((pending) => {
      pending.reject(error);
    });
    pendingByRequestId.clear();
  }
}
