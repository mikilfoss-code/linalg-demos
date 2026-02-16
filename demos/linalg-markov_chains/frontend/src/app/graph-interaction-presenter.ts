import type { AppState } from './types';
import { edgePathKey } from '../lib/markov';

const PROBABILITY_EPSILON = 1e-6;

export type GraphInteractionTarget =
  | {
      kind: 'edge';
      fromIndex: number;
      toIndex: number;
    }
  | {
      kind: 'node';
      nodeIndex: number;
    };

export type GraphInteractionState = {
  hovered: GraphInteractionTarget | null;
  selected: GraphInteractionTarget | null;
};

export type GraphEdgeEditorModel = {
  fromIndex: number;
  toIndex: number;
  value: number;
};

export type GraphNodeEditorModel = {
  nodeIndex: number;
  value: number;
};

export type GraphInteractionPresentation = {
  activeTarget: GraphInteractionTarget | null;
  selectedTarget: GraphInteractionTarget | null;
  highlightedEdgeKeys: Set<string>;
  highlightedNodeIndices: Set<number>;
  selectedEdgeEditor: GraphEdgeEditorModel | null;
  selectedNodeEditor: GraphNodeEditorModel | null;
};

/**
 * Create an empty graph interaction state for the hover/select presenter pipeline.
 */
export function createEmptyGraphInteractionState(): GraphInteractionState {
  return {
    hovered: null,
    selected: null,
  };
}

/**
 * Compare two interaction targets by semantic identity.
 */
export function isSameGraphInteractionTarget(
  left: GraphInteractionTarget | null,
  right: GraphInteractionTarget | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'node' && right.kind === 'node') {
    return left.nodeIndex === right.nodeIndex;
  }
  if (left.kind === 'edge' && right.kind === 'edge') {
    return left.fromIndex === right.fromIndex && left.toIndex === right.toIndex;
  }
  return false;
}

/**
 * Remove invalid hover/selection targets when node count changes.
 */
export function sanitizeGraphInteractionState(
  interaction: GraphInteractionState,
  appState: AppState
): GraphInteractionState {
  return {
    hovered: sanitizeTarget(interaction.hovered, appState),
    selected: sanitizeTarget(interaction.selected, appState),
  };
}

/**
 * Build highlight and selected-edit models from app state and interaction state.
 */
export function buildGraphInteractionPresentation(
  appState: AppState,
  interaction: GraphInteractionState
): GraphInteractionPresentation {
  const activeTarget = interaction.hovered ?? interaction.selected;
  const highlightedEdgeKeys = new Set<string>();
  const highlightedNodeIndices = new Set<number>();

  if (activeTarget?.kind === 'edge') {
    highlightedEdgeKeys.add(edgePathKey(activeTarget.fromIndex, activeTarget.toIndex));
    highlightedNodeIndices.add(activeTarget.fromIndex);
    highlightedNodeIndices.add(activeTarget.toIndex);
  } else if (activeTarget?.kind === 'node') {
    highlightedNodeIndices.add(activeTarget.nodeIndex);
    const row = appState.transitionMatrix[activeTarget.nodeIndex] ?? [];
    row.forEach((value, toIndex) => {
      if ((value ?? 0) > PROBABILITY_EPSILON) {
        highlightedEdgeKeys.add(edgePathKey(activeTarget.nodeIndex, toIndex));
      }
    });
  }

  return {
    activeTarget,
    selectedTarget: interaction.selected,
    highlightedEdgeKeys,
    highlightedNodeIndices,
    selectedEdgeEditor: buildSelectedEdgeEditor(appState, interaction.selected),
    selectedNodeEditor: buildSelectedNodeEditor(appState, interaction.selected),
  };
}

function buildSelectedEdgeEditor(
  appState: AppState,
  selectedTarget: GraphInteractionTarget | null
): GraphEdgeEditorModel | null {
  if (!selectedTarget || selectedTarget.kind !== 'edge') return null;
  const probability =
    appState.transitionMatrix[selectedTarget.fromIndex]?.[selectedTarget.toIndex] ?? 0;
  return {
    fromIndex: selectedTarget.fromIndex,
    toIndex: selectedTarget.toIndex,
    value: probability,
  };
}

function buildSelectedNodeEditor(
  appState: AppState,
  selectedTarget: GraphInteractionTarget | null
): GraphNodeEditorModel | null {
  if (!selectedTarget || selectedTarget.kind !== 'node') return null;
  return {
    nodeIndex: selectedTarget.nodeIndex,
    value: appState.currentVector[selectedTarget.nodeIndex] ?? 0,
  };
}

function sanitizeTarget(
  target: GraphInteractionTarget | null,
  appState: AppState
): GraphInteractionTarget | null {
  if (!target) return null;
  if (target.kind === 'node') {
    return isValidIndex(target.nodeIndex, appState.nodeCount) ? target : null;
  }

  if (!isValidIndex(target.fromIndex, appState.nodeCount)) return null;
  if (!isValidIndex(target.toIndex, appState.nodeCount)) return null;
  return target;
}

function isValidIndex(index: number, nodeCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < nodeCount;
}
