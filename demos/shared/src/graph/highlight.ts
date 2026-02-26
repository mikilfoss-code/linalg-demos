import type {
  GraphDirectedEdge,
  GraphHighlightPresentation,
  GraphInteractionState,
  GraphInteractionTarget,
} from './types';

export type {
  GraphDirectedEdge,
  GraphHighlightPresentation,
  GraphInteractionState,
  GraphInteractionTarget,
} from './types';

const DEFAULT_MIN_EDGE_WEIGHT = 1e-6;

/**
 * Build stable keys for directed edges.
 */
export function edgePathKey(fromIndex: number, toIndex: number): string {
  return `edge-${fromIndex}-${toIndex}`;
}

/**
 * Create an empty interaction state.
 */
export function createEmptyGraphInteractionState(): GraphInteractionState {
  return {
    hovered: null,
    selected: null,
  };
}

/**
 * Compare interaction targets by semantic identity.
 */
export function isSameGraphInteractionTarget(
  left: GraphInteractionTarget | null,
  right: GraphInteractionTarget | null
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  if (
    (left.kind === 'node' && right.kind === 'node') ||
    (left.kind === 'incoming-node' && right.kind === 'incoming-node')
  ) {
    return left.nodeIndex === right.nodeIndex;
  }
  if (left.kind === 'edge' && right.kind === 'edge') {
    return left.fromIndex === right.fromIndex && left.toIndex === right.toIndex;
  }
  return false;
}

/**
 * Remove invalid targets after node-count changes.
 */
export function sanitizeGraphInteractionState(
  interaction: GraphInteractionState,
  nodeCount: number
): GraphInteractionState {
  return {
    hovered: sanitizeTarget(interaction.hovered, nodeCount),
    selected: sanitizeTarget(interaction.selected, nodeCount),
  };
}

/**
 * Compute highlighted edges/nodes from interaction and directed edge list.
 */
export function buildGraphHighlightPresentation(options: {
  interaction: GraphInteractionState;
  nodeCount: number;
  edges: readonly GraphDirectedEdge[];
  minEdgeWeight?: number;
}): GraphHighlightPresentation {
  const minEdgeWeight = options.minEdgeWeight ?? DEFAULT_MIN_EDGE_WEIGHT;
  const activeTarget = options.interaction.hovered ?? options.interaction.selected;
  const highlightedEdgeKeys = new Set<string>();
  const highlightedNodeIndices = new Set<number>();

  if (activeTarget?.kind === 'edge') {
    highlightedEdgeKeys.add(edgePathKey(activeTarget.fromIndex, activeTarget.toIndex));
    highlightedNodeIndices.add(activeTarget.fromIndex);
    highlightedNodeIndices.add(activeTarget.toIndex);
  } else if (activeTarget?.kind === 'node') {
    highlightedNodeIndices.add(activeTarget.nodeIndex);
    options.edges.forEach((edge) => {
      if (edge.fromIndex !== activeTarget.nodeIndex) {
        return;
      }
      if (Math.abs(edge.weight) <= minEdgeWeight) {
        return;
      }
      highlightedEdgeKeys.add(edgePathKey(edge.fromIndex, edge.toIndex));
      highlightedNodeIndices.add(edge.toIndex);
    });
  } else if (activeTarget?.kind === 'incoming-node') {
    highlightedNodeIndices.add(activeTarget.nodeIndex);
    options.edges.forEach((edge) => {
      if (edge.toIndex !== activeTarget.nodeIndex) {
        return;
      }
      if (Math.abs(edge.weight) <= minEdgeWeight) {
        return;
      }
      highlightedEdgeKeys.add(edgePathKey(edge.fromIndex, edge.toIndex));
      highlightedNodeIndices.add(edge.fromIndex);
    });
  }

  return {
    activeTarget,
    selectedTarget: options.interaction.selected,
    highlightedEdgeKeys,
    highlightedNodeIndices,
  };
}

/**
 * Read graph interaction targets from elements carrying target datasets.
 */
export function readGraphInteractionTargetFromElement(
  eventTarget: EventTarget | null
): GraphInteractionTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const targetElement = eventTarget.closest<HTMLElement>('[data-graph-target-kind]');
  if (!targetElement) {
    return null;
  }
  const kind = targetElement.dataset.graphTargetKind;
  if (kind === 'node' || kind === 'incoming-node') {
    const nodeIndex = Number.parseInt(targetElement.dataset.nodeIndex ?? '', 10);
    if (!Number.isInteger(nodeIndex)) {
      return null;
    }
    return {
      kind,
      nodeIndex,
    };
  }

  if (kind === 'edge') {
    const fromIndex = Number.parseInt(targetElement.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(targetElement.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return null;
    }
    return {
      kind: 'edge',
      fromIndex,
      toIndex,
    };
  }

  return null;
}

function sanitizeTarget(
  target: GraphInteractionTarget | null,
  nodeCount: number
): GraphInteractionTarget | null {
  if (!target) {
    return null;
  }
  if (target.kind === 'node' || target.kind === 'incoming-node') {
    return isValidIndex(target.nodeIndex, nodeCount) ? target : null;
  }
  if (!isValidIndex(target.fromIndex, nodeCount)) {
    return null;
  }
  if (!isValidIndex(target.toIndex, nodeCount)) {
    return null;
  }
  return target;
}

function isValidIndex(index: number, nodeCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < nodeCount;
}
