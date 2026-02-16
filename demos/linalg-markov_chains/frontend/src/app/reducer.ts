import type { Action } from './actions';
import type { AppState } from './types';
import {
  buildValidationSummary,
  clampNodeCount,
  clampProbability,
  createDefaultMatrix,
  createDefaultVector,
  createFlowAnimation,
  DEFAULT_NODE_COUNT,
  normalizeProbabilityVector,
  resizeMatrixToNodeCount,
  resizeVectorToNodeCount,
  stepVector,
} from '../lib/markov';

/**
 * Create the initial reducer state for the Markov demo.
 */
export function createInitialState(): AppState {
  const transitionMatrix = createDefaultMatrix(DEFAULT_NODE_COUNT);
  const initialVector = createDefaultVector(DEFAULT_NODE_COUNT);
  const currentVector = [...initialVector];

  return {
    nodeCount: DEFAULT_NODE_COUNT,
    transitionMatrix,
    initialVector,
    currentVector,
    stepCount: 0,
    sourceMode: 'manual',
    validation: buildValidationSummary(transitionMatrix, initialVector, currentVector),
    flowAnimation: null,
    nextAnimationId: 1,
    hasPendingMatrixEdits: false,
  };
}

/**
 * Reducer handling all Markov demo state transitions.
 */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_NODE_COUNT': {
      const nextNodeCount = clampNodeCount(action.nodeCount);
      if (nextNodeCount === state.nodeCount) {
        return state;
      }

      const transitionMatrix = resizeMatrixToNodeCount(state.transitionMatrix, nextNodeCount);
      const initialVector = resizeVectorToNodeCount(state.initialVector, nextNodeCount);
      const currentVector = resizeVectorToNodeCount(state.currentVector, nextNodeCount);
      return withValidation({
        ...state,
        nodeCount: nextNodeCount,
        transitionMatrix,
        initialVector,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
        hasPendingMatrixEdits: false,
      });
    }

    case 'SET_TRANSITION_CELL': {
      if (!isValidIndex(action.rowIndex, state.nodeCount) || !isValidIndex(action.colIndex, state.nodeCount)) {
        return state;
      }

      const transitionMatrix = state.transitionMatrix.map((row, rowIndex) => {
        if (rowIndex !== action.rowIndex) {
          return [...row];
        }
        return row.map((value, colIndex) => {
          if (colIndex !== action.colIndex) {
            return value;
          }
          return clampProbability(action.value);
        });
      });

      const initialVector = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      const currentVector = normalizeVectorWithDefault(state.currentVector, state.nodeCount);

      return withValidation({
        ...state,
        transitionMatrix,
        initialVector,
        currentVector,
        hasPendingMatrixEdits: true,
      });
    }

    case 'SET_GRAPH_EDGE_CELL': {
      if (!isValidIndex(action.rowIndex, state.nodeCount) || !isValidIndex(action.colIndex, state.nodeCount)) {
        return state;
      }

      const transitionMatrix = state.transitionMatrix.map((row, rowIndex) => {
        if (rowIndex !== action.rowIndex) {
          return [...row];
        }

        const updatedRow = row.map((value, colIndex) => {
          if (colIndex !== action.colIndex) {
            return value;
          }
          return clampProbability(action.value);
        });

        return normalizeRowWithFallback(updatedRow, rowIndex, false);
      });

      const initialVector = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      const currentVector = normalizeVectorWithDefault(state.currentVector, state.nodeCount);

      return withValidation({
        ...state,
        transitionMatrix,
        initialVector,
        currentVector,
        hasPendingMatrixEdits: false,
      });
    }

    case 'SET_INITIAL_CELL': {
      if (!isValidIndex(action.index, state.nodeCount)) {
        return state;
      }
      const initialVector = state.initialVector.map((value, index) => {
        if (index !== action.index) {
          return value;
        }
        return clampProbability(action.value);
      });
      return withValidation({
        ...state,
        initialVector,
      });
    }

    case 'SET_CURRENT_CELL': {
      if (!isValidIndex(action.index, state.nodeCount)) {
        return state;
      }
      const currentVector = state.currentVector.map((value, index) => {
        if (index !== action.index) {
          return value;
        }
        return clampProbability(action.value);
      });
      return withValidation({
        ...state,
        currentVector,
      });
    }

    case 'SET_INITIAL_UNIFORM': {
      const nextInitial = createUniformProbabilityVector(state.nodeCount);
      return withValidation({
        ...state,
        initialVector: [...nextInitial],
        currentVector: [...nextInitial],
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'SET_INITIAL_RANDOM': {
      const nextInitial = createRandomProbabilityVector(state.nodeCount);
      return withValidation({
        ...state,
        initialVector: [...nextInitial],
        currentVector: [...nextInitial],
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'SET_INITIAL_FROM_CURRENT': {
      const normalizedCurrent = normalizeVectorWithDefault(state.currentVector, state.nodeCount);
      return withValidation({
        ...state,
        initialVector: [...normalizedCurrent],
        currentVector: [...normalizedCurrent],
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'APPLY_CURRENT_AS_INITIAL_RESET': {
      const normalizedCurrent = normalizeVectorWithDefault(state.currentVector, state.nodeCount);
      return withValidation({
        ...state,
        initialVector: [...normalizedCurrent],
        currentVector: [...normalizedCurrent],
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'NORMALIZE_INITIAL_AND_RESET': {
      const normalizedInitial = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      return withValidation({
        ...state,
        initialVector: normalizedInitial,
        currentVector: [...normalizedInitial],
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'SET_GRAPH_NODE_VALUE': {
      if (!isValidIndex(action.index, state.nodeCount)) {
        return state;
      }

      const updatedCurrent = state.currentVector.map((value, index) => {
        if (index !== action.index) {
          return value;
        }
        return clampProbability(action.value);
      });

      let normalizedCurrent = normalizeProbabilityVector(updatedCurrent);
      if (vectorSum(normalizedCurrent) <= Number.EPSILON) {
        normalizedCurrent = Array.from({ length: state.nodeCount }, (_, index) =>
          index === action.index ? 1 : 0
        );
      }

      const initialVector = [...normalizedCurrent];
      const currentVector = [...normalizedCurrent];

      return withValidation({
        ...state,
        initialVector,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'APPLY_GENERATED_GRAPH': {
      if (
        action.transitionMatrix.length !== state.nodeCount ||
        action.initialVector.length !== state.nodeCount ||
        action.currentVector.length !== state.nodeCount
      ) {
        return state;
      }

      const transitionMatrix = action.transitionMatrix.map((row, rowIndex) => {
        if (!Array.isArray(row) || row.length !== state.nodeCount) {
          return state.transitionMatrix[rowIndex] ?? createDefaultMatrix(state.nodeCount)[rowIndex];
        }

        const sanitized = row.map((value, colIndex) => {
          if (colIndex === rowIndex) {
            return 0;
          }
          return clampProbability(value);
        });
        const sum = vectorSum(sanitized);
        if (sum <= Number.EPSILON) {
          const fallbackRow = Array.from({ length: state.nodeCount }, () => 0);
          const fallbackTarget = rowIndex === 0 ? 1 : 0;
          fallbackRow[fallbackTarget] = 1;
          return fallbackRow;
        }
        return sanitized.map((value) => value / sum);
      });

      const initialVector = resizeVectorToNodeCount(action.initialVector, state.nodeCount);
      const currentVector = resizeVectorToNodeCount(action.currentVector, state.nodeCount);

      return withValidation({
        ...state,
        transitionMatrix,
        initialVector,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
        hasPendingMatrixEdits: false,
      });
    }

    case 'NORMALIZE_MATRIX': {
      const transitionMatrix = state.transitionMatrix.map((row, rowIndex) => {
        const normalized = normalizeProbabilityVector(row);
        if (vectorSum(normalized) <= Number.EPSILON) {
          normalized[rowIndex] = 1;
          return normalizeProbabilityVector(normalized);
        }
        return normalized;
      });
      const initialVector = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      const currentVector = normalizeVectorWithDefault(state.currentVector, state.nodeCount);
      return withValidation({
        ...state,
        transitionMatrix,
        initialVector,
        currentVector,
        hasPendingMatrixEdits: false,
      });
    }

    case 'STEP': {
      if (!state.validation.canStep) {
        return state;
      }

      const fromVector = [...state.currentVector];
      const toVector = stepVector(fromVector, state.transitionMatrix);
      const flowAnimation = createFlowAnimation(
        state.nextAnimationId,
        fromVector,
        toVector,
        state.transitionMatrix
      );

      return withValidation({
        ...state,
        currentVector: toVector,
        stepCount: state.stepCount + 1,
        flowAnimation,
        nextAnimationId: state.nextAnimationId + 1,
      });
    }

    case 'RESET_TO_INITIAL': {
      const currentVector = normalizeProbabilityVector(state.initialVector);
      return withValidation({
        ...state,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
      });
    }

    case 'CLEAR_FLOW_ANIMATION': {
      if (!state.flowAnimation || state.flowAnimation.id !== action.animationId) {
        return state;
      }
      return {
        ...state,
        flowAnimation: null,
      };
    }

    default:
      return state;
  }
}

function withValidation(state: Omit<AppState, 'validation'>): AppState {
  return {
    ...state,
    validation: buildValidationSummary(state.transitionMatrix, state.initialVector, state.currentVector),
  };
}

function isValidIndex(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size;
}

function vectorSum(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function normalizeRowWithFallback(
  row: number[],
  rowIndex: number,
  allowSelfLoopFallback: boolean
): number[] {
  const normalized = normalizeProbabilityVector(row);
  if (vectorSum(normalized) > Number.EPSILON) {
    return normalized;
  }

  const fallback = Array.from({ length: row.length }, () => 0);
  if (allowSelfLoopFallback) {
    fallback[rowIndex] = 1;
  } else {
    const fallbackTarget = rowIndex === 0 ? 1 : 0;
    if (fallbackTarget >= 0 && fallbackTarget < fallback.length) {
      fallback[fallbackTarget] = 1;
    } else if (fallback.length > 0) {
      fallback[0] = 1;
    }
  }
  return normalizeProbabilityVector(fallback);
}

function normalizeVectorWithDefault(vector: number[], nodeCount: number): number[] {
  const normalized = normalizeProbabilityVector(vector);
  if (vectorSum(normalized) > Number.EPSILON) {
    return normalized;
  }
  return createDefaultVector(nodeCount);
}

function createUniformProbabilityVector(nodeCount: number): number[] {
  if (nodeCount <= 0) {
    return [];
  }
  const uniformValue = 1 / nodeCount;
  return Array.from({ length: nodeCount }, () => uniformValue);
}

function createRandomProbabilityVector(nodeCount: number): number[] {
  const raw = Array.from({ length: nodeCount }, () => Math.random());
  return normalizeVectorWithDefault(raw, nodeCount);
}
