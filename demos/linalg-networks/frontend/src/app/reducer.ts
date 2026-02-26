import {
  buildDirectedIncidenceMatrix,
  columnSpaceBasis,
  computeRref,
  leftNullSpaceBasis,
  multiplyMatrixVector,
  nullSpaceBasis,
  rowSpaceBasis,
  transposeMatrix,
} from '@shared/lib/linear-algebra';
import type { NetworksAction } from './actions';
import type {
  BasisSpace,
  NetworksDerivedState,
  NetworksEdge,
  NetworksNode,
  NetworksState,
  SelectedBasisVector,
} from './types';

export const MAX_NODES = 8;
export const MAX_EDGES = 16;

/**
 * Create initial state for the networks demo.
 */
export function createInitialState(): NetworksState {
  const nodes: NetworksNode[] = [{ id: 0 }, { id: 1 }, { id: 2 }];
  const edges: NetworksEdge[] = [
    { id: 'edge-1', from: 0, to: 1 },
    { id: 'edge-2', from: 1, to: 2 },
    { id: 'edge-3', from: 2, to: 0 },
  ];
  const flowVector = [1, 0.5, 0.25];

  const initial: NetworksState = {
    nodes,
    edges,
    flowVector,
    nextNodeId: 3,
    nextEdgeId: 4,
    edgeDraftFrom: 0,
    edgeDraftTo: 1,
    selectedBasis: null,
    message: null,
    derived: createDerivedState(nodes, edges, flowVector),
  };

  return normalizeState(initial);
}

/**
 * Reducer for network graph/matrix updates.
 */
export function reducer(state: NetworksState, action: NetworksAction): NetworksState {
  switch (action.type) {
    case 'ADD_NODE': {
      if (state.nodes.length >= MAX_NODES) {
        return {
          ...state,
          message: `Node limit reached (${MAX_NODES}).`,
        };
      }
      const nextNodes = [...state.nodes, { id: state.nextNodeId }];
      return normalizeState({
        ...state,
        nodes: nextNodes,
        nextNodeId: state.nextNodeId + 1,
        message: null,
      });
    }

    case 'REMOVE_NODE': {
      if (state.nodes.length <= 1) {
        return {
          ...state,
          message: 'At least one node must remain.',
        };
      }
      const removedNodeId = state.nodes[state.nodes.length - 1].id;
      const nextNodes = state.nodes.slice(0, -1);
      const keptEdges: NetworksEdge[] = [];
      const keptFlows: number[] = [];

      state.edges.forEach((edge, edgeIndex) => {
        if (edge.from === removedNodeId || edge.to === removedNodeId) {
          return;
        }
        keptEdges.push(edge);
        keptFlows.push(state.flowVector[edgeIndex] ?? 0);
      });

      return normalizeState({
        ...state,
        nodes: nextNodes,
        edges: keptEdges,
        flowVector: keptFlows,
        message: null,
      });
    }

    case 'SET_EDGE_DRAFT_FROM': {
      return normalizeState({
        ...state,
        edgeDraftFrom: action.nodeId,
      });
    }

    case 'SET_EDGE_DRAFT_TO': {
      return normalizeState({
        ...state,
        edgeDraftTo: action.nodeId,
      });
    }

    case 'ADD_EDGE': {
      if (state.nodes.length <= 1) {
        return {
          ...state,
          message: 'Add at least two nodes before adding edges.',
        };
      }
      if (state.edges.length >= MAX_EDGES) {
        return {
          ...state,
          message: `Edge limit reached (${MAX_EDGES}).`,
        };
      }
      if (state.edgeDraftFrom === state.edgeDraftTo) {
        return {
          ...state,
          message: 'Self-loops are disabled in this demo.',
        };
      }
      const duplicateEdge = state.edges.some(
        (edge) => edge.from === state.edgeDraftFrom && edge.to === state.edgeDraftTo
      );
      if (duplicateEdge) {
        return {
          ...state,
          message: 'Parallel directed edges are disabled in this demo.',
        };
      }

      const nextEdge: NetworksEdge = {
        id: `edge-${state.nextEdgeId}`,
        from: state.edgeDraftFrom,
        to: state.edgeDraftTo,
      };
      return normalizeState({
        ...state,
        edges: [...state.edges, nextEdge],
        flowVector: [...state.flowVector, 0],
        nextEdgeId: state.nextEdgeId + 1,
        message: null,
      });
    }

    case 'REMOVE_EDGE': {
      const edgeIndex = state.edges.findIndex((edge) => edge.id === action.edgeId);
      if (edgeIndex < 0) {
        return state;
      }

      const nextEdges = state.edges.filter((edge) => edge.id !== action.edgeId);
      const nextFlow = state.flowVector.filter((_, index) => index !== edgeIndex);
      return normalizeState({
        ...state,
        edges: nextEdges,
        flowVector: nextFlow,
        message: null,
      });
    }

    case 'SET_EDGE_FLOW': {
      const edgeIndex = state.edges.findIndex((edge) => edge.id === action.edgeId);
      if (edgeIndex < 0) {
        return state;
      }
      const nextFlow = [...state.flowVector];
      nextFlow[edgeIndex] = Number.isFinite(action.value) ? action.value : 0;
      return normalizeState({
        ...state,
        flowVector: nextFlow,
      });
    }

    case 'SELECT_BASIS_VECTOR': {
      return normalizeState({
        ...state,
        selectedBasis: {
          space: action.space,
          index: action.index,
        },
      });
    }

    default: {
      return state;
    }
  }
}

/**
 * Resolve selected basis vector from current state.
 */
export function selectedBasisVector(state: NetworksState): number[] | null {
  if (!state.selectedBasis) {
    return null;
  }
  const vectors = basisVectorsBySpace(state.derived, state.selectedBasis.space);
  return vectors[state.selectedBasis.index] ?? null;
}

function normalizeState(state: NetworksState): NetworksState {
  const normalizedDraftFrom = normalizeDraftNodeId(state.nodes, state.edgeDraftFrom);
  const normalizedDraftTo = normalizeDraftNodeId(state.nodes, state.edgeDraftTo);
  const normalizedFlow = normalizeFlowVectorLength(state.flowVector, state.edges.length);
  const derived = createDerivedState(state.nodes, state.edges, normalizedFlow);
  const normalizedSelectedBasis = normalizeSelectedBasis(state.selectedBasis, derived);

  return {
    ...state,
    edgeDraftFrom: normalizedDraftFrom,
    edgeDraftTo: normalizedDraftTo,
    flowVector: normalizedFlow,
    selectedBasis: normalizedSelectedBasis,
    derived,
  };
}

function normalizeDraftNodeId(nodes: readonly NetworksNode[], nodeId: number): number {
  if (nodes.some((node) => node.id === nodeId)) {
    return nodeId;
  }
  if (nodes.length === 0) {
    return 0;
  }
  return nodes[0].id;
}

function normalizeFlowVectorLength(flowVector: readonly number[], edgeCount: number): number[] {
  const next = Array.from({ length: edgeCount }, (_, index) => flowVector[index] ?? 0);
  return next.map((value) => (Number.isFinite(value) ? value : 0));
}

function normalizeSelectedBasis(
  selectedBasis: SelectedBasisVector,
  derived: NetworksDerivedState
): SelectedBasisVector {
  if (!selectedBasis) {
    return null;
  }
  const vectors = basisVectorsBySpace(derived, selectedBasis.space);
  if (selectedBasis.index < 0 || selectedBasis.index >= vectors.length) {
    return null;
  }
  return selectedBasis;
}

function basisVectorsBySpace(derived: NetworksDerivedState, space: BasisSpace): number[][] {
  if (space === 'row') {
    return derived.basis.row;
  }
  if (space === 'column') {
    return derived.basis.column;
  }
  if (space === 'left-null') {
    return derived.basis.leftNull;
  }
  return derived.basis.null;
}

function createDerivedState(
  nodes: readonly NetworksNode[],
  edges: readonly NetworksEdge[],
  flowVector: readonly number[]
): NetworksDerivedState {
  const nodeIndexById = new Map<number, number>();
  nodes.forEach((node, index) => {
    nodeIndexById.set(node.id, index);
  });

  const directedEdges = edges.map((edge) => ({
    from: nodeIndexById.get(edge.from) ?? 0,
    to: nodeIndexById.get(edge.to) ?? 0,
  }));

  const incidenceMatrix = buildDirectedIncidenceMatrix(nodes.length, directedEdges);
  const imbalanceVector = multiplyMatrixVector(incidenceMatrix, flowVector);
  const rrefMatrix = computeRref(incidenceMatrix).matrix;
  const rrefTransposeMatrix = computeRref(transposeMatrix(incidenceMatrix)).matrix;

  return {
    incidenceMatrix,
    imbalanceVector,
    rrefMatrix,
    rrefTransposeMatrix,
    basis: {
      row: rowSpaceBasis(incidenceMatrix),
      column: columnSpaceBasis(incidenceMatrix),
      null: nullSpaceBasis(incidenceMatrix),
      leftNull: leftNullSpaceBasis(incidenceMatrix),
    },
  };
}
