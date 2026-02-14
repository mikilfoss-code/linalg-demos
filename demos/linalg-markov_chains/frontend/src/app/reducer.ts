import type { Action } from './actions';
import type { AnalysisState, AppState } from './types';
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

function createIdleAnalysisState(): AnalysisState {
  return {
    status: 'idle',
    result: null,
    errorMessage: null,
  };
}

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
    analysis: createIdleAnalysisState(),
    flowAnimation: null,
    nextAnimationId: 1,
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
        analysis: createIdleAnalysisState(),
        flowAnimation: null,
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

      return withValidation({
        ...state,
        transitionMatrix,
        analysis: createIdleAnalysisState(),
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
        analysis: createIdleAnalysisState(),
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
        analysis: createIdleAnalysisState(),
      });
    }

    case 'NORMALIZE_ROW': {
      if (!isValidIndex(action.rowIndex, state.nodeCount)) {
        return state;
      }
      const transitionMatrix = state.transitionMatrix.map((row, rowIndex) => {
        if (rowIndex !== action.rowIndex) {
          return [...row];
        }
        const normalized = normalizeProbabilityVector(row);
        if (vectorSum(normalized) <= Number.EPSILON) {
          normalized[rowIndex] = 1;
          return normalizeProbabilityVector(normalized);
        }
        return normalized;
      });
      return withValidation({
        ...state,
        transitionMatrix,
        analysis: createIdleAnalysisState(),
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
      return withValidation({
        ...state,
        transitionMatrix,
        analysis: createIdleAnalysisState(),
      });
    }

    case 'NORMALIZE_INITIAL_VECTOR': {
      const initialVector = normalizeProbabilityVector(state.initialVector);
      return withValidation({
        ...state,
        initialVector,
        analysis: createIdleAnalysisState(),
      });
    }

    case 'NORMALIZE_CURRENT_VECTOR': {
      const currentVector = normalizeProbabilityVector(state.currentVector);
      return withValidation({
        ...state,
        currentVector,
        analysis: createIdleAnalysisState(),
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
        analysis: createIdleAnalysisState(),
      });
    }

    case 'RESET_TO_INITIAL': {
      const currentVector = normalizeProbabilityVector(state.initialVector);
      return withValidation({
        ...state,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
        analysis: createIdleAnalysisState(),
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

    case 'ANALYZE_REQUEST': {
      return {
        ...state,
        analysis: {
          status: 'loading',
          result: null,
          errorMessage: null,
        },
      };
    }

    case 'ANALYZE_SUCCESS': {
      return {
        ...state,
        analysis: {
          status: 'success',
          result: action.result,
          errorMessage: null,
        },
      };
    }

    case 'ANALYZE_ERROR': {
      return {
        ...state,
        analysis: {
          status: 'error',
          result: null,
          errorMessage: action.message,
        },
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
