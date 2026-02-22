import type { Action } from './actions';
import type { AppState } from './types';
import {
  createEmptyEditDrafts,
  createIdleEditSessionState,
  edgeDraftKey,
  parseEdgeDraftKey,
  type EditDrafts,
  type EditSnapshot,
  type EditTarget,
} from './edit-session';
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
    editSession: createIdleEditSessionState(),
    interaction: {
      hoverTarget: null,
      selectedTarget: null,
    },
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

    case 'APPLY_TRANSITION_DRAFTS_AND_NORMALIZE': {
      let didApplyAnyEdit = false;
      const transitionMatrix = state.transitionMatrix.map((row, rowIndex) =>
        row.map((value, colIndex) => {
          const matchingEdit = action.edits.find(
            (edit) => edit.rowIndex === rowIndex && edit.colIndex === colIndex
          );
          if (!matchingEdit) {
            return value;
          }
          didApplyAnyEdit = true;
          return clampProbability(matchingEdit.value);
        })
      );

      const normalizedMatrix = didApplyAnyEdit
        ? normalizeTransitionRows(transitionMatrix)
        : normalizeTransitionRows(state.transitionMatrix);
      const initialVector = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      const currentVector = normalizeVectorWithDefault(state.currentVector, state.nodeCount);
      return withValidation({
        ...state,
        transitionMatrix: normalizedMatrix,
        initialVector,
        currentVector,
        stepCount: 0,
        flowAnimation: null,
        hasPendingMatrixEdits: false,
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

    case 'APPLY_INITIAL_DRAFTS_AND_RESET': {
      const draftMap = new Map<number, number>();
      action.edits.forEach((edit) => {
        if (isValidIndex(edit.index, state.nodeCount)) {
          draftMap.set(edit.index, clampProbability(edit.value));
        }
      });
      const nextInitial = state.initialVector.map((value, index) =>
        draftMap.has(index) ? (draftMap.get(index) as number) : value
      );
      const normalizedInitial = normalizeVectorWithDefault(nextInitial, state.nodeCount);
      return withValidation({
        ...state,
        initialVector: normalizedInitial,
        currentVector: [...normalizedInitial],
        stepCount: 0,
        flowAnimation: null,
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

    case 'APPLY_CURRENT_DRAFTS_AND_RESET': {
      const draftMap = new Map<number, number>();
      action.edits.forEach((edit) => {
        if (isValidIndex(edit.index, state.nodeCount)) {
          draftMap.set(edit.index, clampProbability(edit.value));
        }
      });
      const nextCurrent = state.currentVector.map((value, index) =>
        draftMap.has(index) ? (draftMap.get(index) as number) : value
      );
      const normalizedCurrent = normalizeVectorWithDefault(nextCurrent, state.nodeCount);
      return withValidation({
        ...state,
        initialVector: [...normalizedCurrent],
        currentVector: [...normalizedCurrent],
        stepCount: 0,
        flowAnimation: null,
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
      const transitionMatrix = normalizeTransitionRows(state.transitionMatrix);
      const initialVector = normalizeVectorWithDefault(state.initialVector, state.nodeCount);
      const currentVector = normalizeVectorWithDefault(state.currentVector, state.nodeCount);
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

    case 'STEP': {
      const transitionMatrix = state.hasPendingMatrixEdits
        ? normalizeTransitionRows(state.transitionMatrix)
        : state.transitionMatrix;
      const validation = buildValidationSummary(
        transitionMatrix,
        state.initialVector,
        state.currentVector
      );
      if (!validation.canStep) {
        return state;
      }

      const fromVector = [...state.currentVector];
      const toVector = stepVector(fromVector, transitionMatrix);
      const flowAnimation = createFlowAnimation(
        state.nextAnimationId,
        fromVector,
        toVector,
        transitionMatrix
      );

      return withValidation({
        ...state,
        transitionMatrix,
        currentVector: toVector,
        stepCount: state.stepCount + 1,
        flowAnimation,
        nextAnimationId: state.nextAnimationId + 1,
        hasPendingMatrixEdits: false,
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

    case 'EDIT_BEGIN': {
      const editSession =
        state.editSession.mode === 'idle'
          ? {
              mode: 'editing' as const,
              ownerPanel: action.panel,
              activeTarget: action.target,
              snapshot: captureEditSnapshot(state),
              drafts: createEmptyEditDrafts(),
              undoStack: [],
              redoStack: [],
            }
          : {
              ...state.editSession,
              mode: 'editing' as const,
              ownerPanel: action.panel,
              activeTarget: action.target,
              snapshot: state.editSession.snapshot ?? captureEditSnapshot(state),
            };
      return {
        ...state,
        editSession,
      };
    }

    case 'EDIT_FOCUS_TARGET': {
      const editSession =
        state.editSession.mode === 'idle'
          ? {
              mode: 'editing' as const,
              ownerPanel: action.panel,
              activeTarget: action.target,
              snapshot: captureEditSnapshot(state),
              drafts: createEmptyEditDrafts(),
              undoStack: [],
              redoStack: [],
            }
          : {
              ...state.editSession,
              ownerPanel: action.panel,
              activeTarget: action.target,
            };
      return {
        ...state,
        editSession,
      };
    }

    case 'EDIT_CHANGE_VALUE': {
      if (state.editSession.mode !== 'editing') {
        return state;
      }
      const sanitizedValue = clampProbability(action.value);
      const previousValue = readDisplayedEditValue(state, action.target);
      if (!Number.isFinite(previousValue)) {
        return state;
      }
      if (Math.abs(previousValue - sanitizedValue) <= 1e-12) {
        return state;
      }

      const nextDrafts = writeDraftValue({
        state,
        drafts: state.editSession.drafts,
        target: action.target,
        value: sanitizedValue,
      });
      const op = {
        target: action.target,
        panel: state.editSession.ownerPanel,
        prev: previousValue,
        next: sanitizedValue,
        ts: Date.now(),
      };
      return {
        ...state,
        editSession: {
          ...state.editSession,
          drafts: nextDrafts,
          undoStack: [...state.editSession.undoStack, op],
          redoStack: [],
        },
      };
    }

    case 'EDIT_TAB_NAVIGATE': {
      if (state.editSession.mode !== 'editing') {
        return state;
      }
      return {
        ...state,
        editSession: {
          ...state.editSession,
          ownerPanel: action.panel,
        },
      };
    }

    case 'EDIT_COMMIT': {
      if (state.editSession.mode !== 'editing') {
        return state;
      }
      const applied = applyDraftsToCommittedModel(state);
      return withValidation({
        ...state,
        transitionMatrix: normalizeTransitionRows(applied.transitionMatrix),
        initialVector: normalizeVectorWithDefault(applied.initialVector, state.nodeCount),
        currentVector: normalizeVectorWithDefault(applied.currentVector, state.nodeCount),
        stepCount: 0,
        flowAnimation: null,
        hasPendingMatrixEdits: false,
        editSession: createIdleEditSessionState(),
      });
    }

    case 'EDIT_CANCEL': {
      if (state.editSession.mode !== 'editing') {
        return state;
      }
      const snapshot = state.editSession.snapshot;
      if (!snapshot) {
        return {
          ...state,
          editSession: createIdleEditSessionState(),
        };
      }
      return withValidation({
        ...state,
        transitionMatrix: snapshot.transitionMatrix.map((row) => [...row]),
        initialVector: [...snapshot.initialVector],
        currentVector: [...snapshot.currentVector],
        stepCount: snapshot.stepCount,
        flowAnimation: snapshot.flowAnimation,
        hasPendingMatrixEdits: false,
        editSession: createIdleEditSessionState(),
      });
    }

    case 'EDIT_UNDO': {
      if (state.editSession.mode !== 'editing' || state.editSession.undoStack.length <= 0) {
        return state;
      }
      const undoStack = [...state.editSession.undoStack];
      const op = undoStack.pop() as (typeof state.editSession.undoStack)[number];
      const nextDrafts = writeDraftValue({
        state,
        drafts: state.editSession.drafts,
        target: op.target,
        value: op.prev,
      });
      return {
        ...state,
        editSession: {
          ...state.editSession,
          drafts: nextDrafts,
          undoStack,
          redoStack: [...state.editSession.redoStack, op],
        },
      };
    }

    case 'EDIT_REDO': {
      if (state.editSession.mode !== 'editing' || state.editSession.redoStack.length <= 0) {
        return state;
      }
      const redoStack = [...state.editSession.redoStack];
      const op = redoStack.pop() as (typeof state.editSession.redoStack)[number];
      const nextDrafts = writeDraftValue({
        state,
        drafts: state.editSession.drafts,
        target: op.target,
        value: op.next,
      });
      return {
        ...state,
        editSession: {
          ...state.editSession,
          drafts: nextDrafts,
          undoStack: [...state.editSession.undoStack, op],
          redoStack,
        },
      };
    }

    case 'INTERACTION_HOVER_SET': {
      if (state.editSession.mode === 'editing') {
        return state;
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          hoverTarget: action.target,
        },
      };
    }

    case 'INTERACTION_SELECT_SET': {
      if (state.editSession.mode === 'editing') {
        return state;
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          selectedTarget: action.target,
        },
      };
    }

    default:
      return state;
  }
}

function captureEditSnapshot(state: AppState): EditSnapshot {
  return {
    transitionMatrix: state.transitionMatrix.map((row) => [...row]),
    currentVector: [...state.currentVector],
    initialVector: [...state.initialVector],
    stepCount: state.stepCount,
    flowAnimation: state.flowAnimation,
  };
}

function applyDraftsToCommittedModel(state: AppState): {
  transitionMatrix: number[][];
  currentVector: number[];
  initialVector: number[];
} {
  const transitionMatrix = state.transitionMatrix.map((row) => [...row]);
  const currentVector = [...state.currentVector];
  const initialVector = [...state.initialVector];

  Object.entries(state.editSession.drafts.edgeByKey).forEach(([key, value]) => {
    const parsed = parseEdgeDraftKey(key);
    if (!parsed) {
      return;
    }
    if (!isValidIndex(parsed.fromIndex, state.nodeCount) || !isValidIndex(parsed.toIndex, state.nodeCount)) {
      return;
    }
    transitionMatrix[parsed.fromIndex][parsed.toIndex] = clampProbability(value);
  });

  let hasNodeDrafts = false;
  Object.entries(state.editSession.drafts.nodeByIndex).forEach(([rawIndex, value]) => {
    const index = Number.parseInt(rawIndex, 10);
    if (!isValidIndex(index, state.nodeCount)) {
      return;
    }
    hasNodeDrafts = true;
    currentVector[index] = clampProbability(value);
  });

  Object.entries(state.editSession.drafts.initialByIndex).forEach(([rawIndex, value]) => {
    const index = Number.parseInt(rawIndex, 10);
    if (!isValidIndex(index, state.nodeCount)) {
      return;
    }
    initialVector[index] = clampProbability(value);
  });

  if (hasNodeDrafts && Object.keys(state.editSession.drafts.initialByIndex).length <= 0) {
    for (let index = 0; index < initialVector.length; index += 1) {
      initialVector[index] = currentVector[index] ?? 0;
    }
  }

  return {
    transitionMatrix,
    currentVector,
    initialVector,
  };
}

function readDisplayedEditValue(state: AppState, target: EditTarget): number {
  if (target.kind === 'edge') {
    if (!isValidIndex(target.fromIndex, state.nodeCount) || !isValidIndex(target.toIndex, state.nodeCount)) {
      return Number.NaN;
    }
    const key = edgeDraftKey(target.fromIndex, target.toIndex);
    const draftValue = state.editSession.drafts.edgeByKey[key];
    if (Number.isFinite(draftValue)) {
      return draftValue;
    }
    return state.transitionMatrix[target.fromIndex]?.[target.toIndex] ?? Number.NaN;
  }

  if (target.kind === 'node') {
    if (!isValidIndex(target.index, state.nodeCount)) {
      return Number.NaN;
    }
    const draftValue = state.editSession.drafts.nodeByIndex[target.index];
    if (Number.isFinite(draftValue)) {
      return draftValue;
    }
    return state.currentVector[target.index] ?? Number.NaN;
  }

  if (!isValidIndex(target.index, state.nodeCount)) {
    return Number.NaN;
  }
  const draftValue = state.editSession.drafts.initialByIndex[target.index];
  if (Number.isFinite(draftValue)) {
    return draftValue;
  }
  const nodeDraftValue = state.editSession.drafts.nodeByIndex[target.index];
  if (Number.isFinite(nodeDraftValue)) {
    return nodeDraftValue;
  }
  return state.initialVector[target.index] ?? Number.NaN;
}

function readCommittedValue(state: AppState, target: EditTarget): number {
  if (target.kind === 'edge') {
    if (!isValidIndex(target.fromIndex, state.nodeCount) || !isValidIndex(target.toIndex, state.nodeCount)) {
      return Number.NaN;
    }
    return state.transitionMatrix[target.fromIndex]?.[target.toIndex] ?? Number.NaN;
  }
  if (target.kind === 'node') {
    if (!isValidIndex(target.index, state.nodeCount)) {
      return Number.NaN;
    }
    return state.currentVector[target.index] ?? Number.NaN;
  }
  if (!isValidIndex(target.index, state.nodeCount)) {
    return Number.NaN;
  }
  return state.initialVector[target.index] ?? Number.NaN;
}

function writeDraftValue(config: {
  state: AppState;
  drafts: EditDrafts;
  target: EditTarget;
  value: number | null;
}): EditDrafts {
  const nextDrafts: EditDrafts = {
    edgeByKey: { ...config.drafts.edgeByKey },
    nodeByIndex: { ...config.drafts.nodeByIndex },
    initialByIndex: { ...config.drafts.initialByIndex },
  };

  if (config.target.kind === 'edge') {
    if (
      !isValidIndex(config.target.fromIndex, config.state.nodeCount) ||
      !isValidIndex(config.target.toIndex, config.state.nodeCount)
    ) {
      return nextDrafts;
    }
    const key = edgeDraftKey(config.target.fromIndex, config.target.toIndex);
    writeDraftEntry({
      bucket: nextDrafts.edgeByKey,
      key,
      committedValue: readCommittedValue(config.state, config.target),
      nextValue: config.value,
    });
    return nextDrafts;
  }

  if (!isValidIndex(config.target.index, config.state.nodeCount)) {
    return nextDrafts;
  }

  if (config.target.kind === 'node') {
    writeDraftEntry({
      bucket: nextDrafts.nodeByIndex,
      key: config.target.index,
      committedValue: readCommittedValue(config.state, config.target),
      nextValue: config.value,
    });
    return nextDrafts;
  }

  writeDraftEntry({
    bucket: nextDrafts.initialByIndex,
    key: config.target.index,
    committedValue: readCommittedValue(config.state, config.target),
    nextValue: config.value,
  });
  return nextDrafts;
}

function writeDraftEntry(config: {
  bucket: Record<string | number, number>;
  key: string | number;
  committedValue: number;
  nextValue: number | null;
}) {
  if (!Number.isFinite(config.nextValue)) {
    delete config.bucket[config.key];
    return;
  }
  const sanitizedNext = clampProbability(config.nextValue as number);
  if (
    Number.isFinite(config.committedValue) &&
    Math.abs(config.committedValue - sanitizedNext) <= 1e-12
  ) {
    delete config.bucket[config.key];
    return;
  }
  config.bucket[config.key] = sanitizedNext;
}

/**
 * Purpose: withValidation function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function withValidation(state: Omit<AppState, 'validation'>): AppState {
  return {
    ...state,
    validation: buildValidationSummary(state.transitionMatrix, state.initialVector, state.currentVector),
  };
}

/**
 * Purpose: isValidIndex function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function isValidIndex(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size;
}

/**
 * Purpose: vectorSum function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function vectorSum(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Purpose: normalizeRowWithFallback function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
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

/**
 * Purpose: normalizeVectorWithDefault function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function normalizeVectorWithDefault(vector: number[], nodeCount: number): number[] {
  const normalized = normalizeProbabilityVector(vector);
  if (vectorSum(normalized) > Number.EPSILON) {
    return normalized;
  }
  return createDefaultVector(nodeCount);
}

/**
 * Purpose: createUniformProbabilityVector function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function createUniformProbabilityVector(nodeCount: number): number[] {
  if (nodeCount <= 0) {
    return [];
  }
  const uniformValue = 1 / nodeCount;
  return Array.from({ length: nodeCount }, () => uniformValue);
}

/**
 * Purpose: createRandomProbabilityVector function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function createRandomProbabilityVector(nodeCount: number): number[] {
  const raw = Array.from({ length: nodeCount }, () => Math.random());
  return normalizeVectorWithDefault(raw, nodeCount);
}

/**
 * Purpose: normalizeTransitionRows function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function normalizeTransitionRows(transitionMatrix: number[][]): number[][] {
  return transitionMatrix.map((row, rowIndex) => {
    const normalized = normalizeProbabilityVector(row);
    if (vectorSum(normalized) <= Number.EPSILON) {
      normalized[rowIndex] = 1;
      return normalizeProbabilityVector(normalized);
    }
    return normalized;
  });
}
