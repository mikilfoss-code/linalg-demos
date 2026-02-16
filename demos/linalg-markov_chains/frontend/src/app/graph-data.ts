import type { AppState } from './types';
import { edgePathKey } from '../lib/markov';

export type GraphSubgraphMode = 'all' | 'top-state-mass';

export type GraphSubgraphSelection = {
  mode: GraphSubgraphMode;
  maxNodes: number;
  minEdgeProbability: number;
};

export type GraphRenderData = {
  nodeCount: number;
  nodeIndices: number[];
  transitionMatrix: number[][];
  currentVector: number[];
  edgeKeys: string[];
};

export const DEFAULT_GRAPH_SUBGRAPH_SELECTION: GraphSubgraphSelection = {
  mode: 'all',
  maxNodes: 120,
  minEdgeProbability: 0,
};

/**
 * Derive the render data used by the graph panel.
 * This is the seam where we can later plug in dataset-driven subgraph extraction.
 */
export function buildGraphRenderData(
  state: AppState,
  selection: GraphSubgraphSelection
): GraphRenderData {
  if (selection.mode === 'all' || selection.maxNodes >= state.nodeCount) {
    return buildAllNodesRenderData(state, selection.minEdgeProbability);
  }
  return buildTopStateMassRenderData(state, selection);
}

function buildAllNodesRenderData(
  state: AppState,
  minEdgeProbability: number
): GraphRenderData {
  const nodeIndices = Array.from({ length: state.nodeCount }, (_, index) => index);
  const edgeKeys = buildEdgeKeys({
    nodeIndices,
    transitionMatrix: state.transitionMatrix,
    minEdgeProbability,
  });

  return {
    nodeCount: state.nodeCount,
    nodeIndices,
    transitionMatrix: state.transitionMatrix.map((row) => [...row]),
    currentVector: [...state.currentVector],
    edgeKeys,
  };
}

function buildTopStateMassRenderData(
  state: AppState,
  selection: GraphSubgraphSelection
): GraphRenderData {
  const nodeIndices = pickTopStateNodes(state.currentVector, selection.maxNodes);

  const transitionMatrix = nodeIndices.map((fromOriginalIndex) => {
    return nodeIndices.map((toOriginalIndex) => {
      return state.transitionMatrix[fromOriginalIndex]?.[toOriginalIndex] ?? 0;
    });
  });
  const currentVector = nodeIndices.map((originalIndex) => state.currentVector[originalIndex] ?? 0);

  const edgeKeys = buildEdgeKeys({
    nodeIndices,
    transitionMatrix: state.transitionMatrix,
    minEdgeProbability: selection.minEdgeProbability,
  });

  return {
    nodeCount: nodeIndices.length,
    nodeIndices,
    transitionMatrix,
    currentVector,
    edgeKeys,
  };
}

function pickTopStateNodes(currentVector: number[], maxNodes: number): number[] {
  const safeMaxNodes = Math.max(2, Math.floor(maxNodes));
  return currentVector
    .map((value, index) => ({ index, value }))
    .sort((left, right) => {
      if (right.value !== left.value) {
        return right.value - left.value;
      }
      return left.index - right.index;
    })
    .slice(0, safeMaxNodes)
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
}

function buildEdgeKeys(options: {
  nodeIndices: number[];
  transitionMatrix: number[][];
  minEdgeProbability: number;
}): string[] {
  const keys: string[] = [];
  const threshold = Math.max(0, options.minEdgeProbability);
  options.nodeIndices.forEach((fromIndex) => {
    options.nodeIndices.forEach((toIndex) => {
      const probability = options.transitionMatrix[fromIndex]?.[toIndex] ?? 0;
      if (probability > threshold) {
        keys.push(edgePathKey(fromIndex, toIndex));
      }
    });
  });
  return keys;
}
