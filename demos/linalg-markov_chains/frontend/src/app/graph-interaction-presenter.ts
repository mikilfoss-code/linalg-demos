import {
  buildGraphHighlightPresentation,
  createEmptyGraphInteractionState,
  isSameGraphInteractionTarget,
  sanitizeGraphInteractionState,
  type GraphInteractionState,
  type GraphInteractionTarget,
} from '@shared/graph/highlight';
import type { AppState } from './types';

const PROBABILITY_EPSILON = 1e-6;

/**
 * Purpose: GraphEdgeEditorModel object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type GraphEdgeEditorModel = {
  fromIndex: number;
  toIndex: number;
  value: number;
};

/**
 * Purpose: GraphNodeEditorModel object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type GraphNodeEditorModel = {
  nodeIndex: number;
  value: number;
};

/**
 * Purpose: GraphInteractionPresentation object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type GraphInteractionPresentation = {
  activeTarget: GraphInteractionTarget | null;
  selectedTarget: GraphInteractionTarget | null;
  highlightedEdgeKeys: Set<string>;
  highlightedNodeIndices: Set<number>;
  selectedEdgeEditor: GraphEdgeEditorModel | null;
  selectedNodeEditor: GraphNodeEditorModel | null;
};

export {
  createEmptyGraphInteractionState,
  isSameGraphInteractionTarget,
  sanitizeGraphInteractionState,
  type GraphInteractionState,
  type GraphInteractionTarget,
};

/**
 * Build highlight and selected-edit models from app state and interaction state.
 */
export function buildGraphInteractionPresentation(
  appState: AppState,
  interaction: GraphInteractionState
): GraphInteractionPresentation {
  const edges = appState.transitionMatrix.flatMap((row, fromIndex) => {
    return row
      .map((value, toIndex) => ({
        fromIndex,
        toIndex,
        weight: value,
      }))
      .filter((edge) => edge.weight > PROBABILITY_EPSILON);
  });

  const sharedPresentation = buildGraphHighlightPresentation({
    interaction,
    nodeCount: appState.nodeCount,
    edges,
    minEdgeWeight: PROBABILITY_EPSILON,
  });

  return {
    activeTarget: sharedPresentation.activeTarget,
    selectedTarget: sharedPresentation.selectedTarget,
    highlightedEdgeKeys: sharedPresentation.highlightedEdgeKeys,
    highlightedNodeIndices: sharedPresentation.highlightedNodeIndices,
    selectedEdgeEditor: buildSelectedEdgeEditor(appState, interaction.selected),
    selectedNodeEditor: buildSelectedNodeEditor(appState, interaction.selected),
  };
}

function buildSelectedEdgeEditor(
  appState: AppState,
  selectedTarget: GraphInteractionTarget | null
): GraphEdgeEditorModel | null {
  if (appState.sourceMode !== 'manual') {
    return null;
  }
  if (!selectedTarget || selectedTarget.kind !== 'edge') {
    return null;
  }
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
  if (appState.sourceMode !== 'manual') {
    return null;
  }
  if (
    !selectedTarget ||
    (selectedTarget.kind !== 'node' && selectedTarget.kind !== 'incoming-node')
  ) {
    return null;
  }
  return {
    nodeIndex: selectedTarget.nodeIndex,
    value: appState.currentVector[selectedTarget.nodeIndex] ?? 0,
  };
}
