import { clampProbability } from '../lib/markov';

export const DEFAULT_GRAPH_LAYOUT_STRATEGY_ID = 'probability-deterministic';
export const RANK_LAYERED_GRAPH_LAYOUT_STRATEGY_ID = 'rank-layered';
export const COMMUNITY_FORCE_GRAPH_LAYOUT_STRATEGY_ID = 'community-force';
export const RADIAL_ANCHOR_GRAPH_LAYOUT_STRATEGY_ID = 'radial-anchor';

const RADIAL_FALLBACK_STRATEGY_ID = 'radial-fallback';
const LAYOUT_EPSILON = 1e-6;
const GRAPH_LAYOUT_CENTER_Y_RATIO = 0.43;
const DATASET_DEFAULT_MAX_VISIBLE_NODES = 12;
const DATASET_SPREAD_MAX_SCALE = 64;
const DATASET_SPREAD_BINARY_SEARCH_STEPS = 18;

/**
 * Purpose: Define a 2D coordinate used for graph geometry and viewport math.
 * Key fields: See the declared properties in this type definition.
 */
type Point = {
  x: number;
  y: number;
};

/**
 * Purpose: Define per-node layout coordinates and loop angle for graph rendering.
 * Key fields: Node index, x/y coordinates, and preferred self-loop angle.
 */
export type GraphNodeLayout = {
  index: number;
  angle: number;
  x: number;
  y: number;
};

/**
 * Purpose: Define numeric layout inputs consumed by layout strategies.
 * Key fields: Node count, transition matrix, viewport size, and edge-length bounds.
 */
export type GraphLayoutInput = {
  nodeCount: number;
  transitionMatrix: number[][];
  width: number;
  height: number;
  nodeRadius: number;
  minEdgeLength: number;
  maxEdgeLength: number;
};

/**
 * Purpose: Define one pluggable strategy used to compute graph node positions.
 * Key fields: See the declared properties in this type definition.
 */
export type GraphLayoutStrategy = {
  id: string;
  computeLayout: (input: GraphLayoutInput) => GraphNodeLayout[];
};

/**
 * Purpose: Define the strategy-driven engine interface used by graph rendering.
 * Key fields: See the declared properties in this type definition.
 */
export type GraphLayoutEngine = {
  computeLayout: (input: GraphLayoutInput, strategyId?: string) => GraphNodeLayout[];
};

/**
 * Build a strategy-based graph layout engine so future subgraph rendering can swap layout tactics.
 */
export function createGraphLayoutEngine(options?: {
  defaultStrategyId?: string;
  customStrategies?: GraphLayoutStrategy[];
}): GraphLayoutEngine {
  const strategies = new Map<string, GraphLayoutStrategy>();
  const builtin = [
    createProbabilityDeterministicStrategy(),
    createRankLayeredStrategy(),
    createCommunityForceStrategy(),
    createRadialAnchorStrategy(),
    createRadialFallbackStrategy(),
  ];

  builtin.forEach((strategy) => strategies.set(strategy.id, strategy));
  options?.customStrategies?.forEach((strategy) => strategies.set(strategy.id, strategy));

  const defaultStrategyId =
    options?.defaultStrategyId && strategies.has(options.defaultStrategyId)
      ? options.defaultStrategyId
      : DEFAULT_GRAPH_LAYOUT_STRATEGY_ID;

  return {
    computeLayout(input, strategyId) {
      const selectedStrategyId =
        strategyId && strategies.has(strategyId) ? strategyId : defaultStrategyId;
      const strategy = strategies.get(selectedStrategyId);
      if (!strategy) {
        throw new Error(`Unknown graph layout strategy: ${selectedStrategyId}`);
      }
      return strategy.computeLayout(input);
    },
  };
}

/**
 * Map probability in [0, 1] to a linearly interpolated edge length in [minLength, maxLength].
 */
export function probabilityToEdgeLength(
  probability: number,
  minLength: number,
  maxLength: number
): number {
  const normalized = clampProbability(probability);
  if (maxLength <= minLength) {
    return minLength;
  }
  return minLength + (1 - normalized) * (maxLength - minLength);
}

/**
 * Purpose: Create the default force-relaxed graph layout strategy seeded by transition coupling.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function createProbabilityDeterministicStrategy(): GraphLayoutStrategy {
  return {
    id: DEFAULT_GRAPH_LAYOUT_STRATEGY_ID,
    computeLayout(input) {
      if (input.nodeCount <= 0) {
        return [];
      }

      const center: Point = {
        x: input.width / 2,
        y: input.height * GRAPH_LAYOUT_CENTER_Y_RATIO,
      };
      const centerNodeIndex = pickCenterNodeIndex(input.transitionMatrix, input.nodeCount);

      const positions: Point[] = Array.from({ length: input.nodeCount }, () => ({
        x: center.x,
        y: center.y,
      }));
      const velocities: Point[] = Array.from({ length: input.nodeCount }, () => ({ x: 0, y: 0 }));

      seedInitialPositions({
        input,
        center,
        centerNodeIndex,
        positions,
      });

      const targetDistances = buildTargetDistanceMatrix(input, centerNodeIndex);

      relaxPositions({
        input,
        center,
        centerNodeIndex,
        positions,
        velocities,
        targetDistances,
      });

      return positions.map((position, index) => ({
        index,
        x: position.x,
        y: position.y,
        angle: computeLoopAngle(index, centerNodeIndex, positions, input.transitionMatrix, center),
      }));
    },
  };
}

/**
 * Build a layered layout useful for larger instructional graph views.
 */
function createRankLayeredStrategy(): GraphLayoutStrategy {
  return {
    id: RANK_LAYERED_GRAPH_LAYOUT_STRATEGY_ID,
    computeLayout(input) {
      if (input.nodeCount <= 0) {
        return [];
      }
      const centerX = input.width / 2;
      const minX = input.nodeRadius + 16;
      const maxX = input.width - input.nodeRadius - 16;
      const minY = input.nodeRadius + 20;
      const maxY = input.height - input.nodeRadius - 20;
      const scoreByIndex = Array.from({ length: input.nodeCount }, (_, index) => {
        let score = 0;
        for (let other = 0; other < input.nodeCount; other += 1) {
          score += clampProbability(input.transitionMatrix[index]?.[other] ?? 0);
          score += clampProbability(input.transitionMatrix[other]?.[index] ?? 0);
        }
        return score;
      });

      const rankedIndices = Array.from({ length: input.nodeCount }, (_, index) => index).sort(
        (left, right) => {
          if (scoreByIndex[right] !== scoreByIndex[left]) {
            return scoreByIndex[right] - scoreByIndex[left];
          }
          return left - right;
        }
      );
      const inverseRank = new Map<number, number>();
      rankedIndices.forEach((nodeIndex, rank) => {
        inverseRank.set(nodeIndex, rank);
      });

      const layout = Array.from({ length: input.nodeCount }, (_, index) => {
        const rank = inverseRank.get(index) ?? index;
        const layerCount = Math.max(3, Math.min(8, Math.round(Math.sqrt(input.nodeCount))));
        const layer = rank % layerCount;
        const row = Math.floor(rank / layerCount);
        const maxRow = Math.max(1, Math.ceil(input.nodeCount / layerCount) - 1);
        const y = lerp(minY, maxY, row / maxRow);
        const spread = Math.max(30, (maxX - minX) * 0.42);
        const layerProgress = layerCount <= 1 ? 0 : layer / (layerCount - 1);
        const x = clamp(centerX - spread / 2 + spread * layerProgress, minX, maxX);
        const angle = Math.atan2(y - input.height * GRAPH_LAYOUT_CENTER_Y_RATIO, x - centerX);
        return {
          index,
          angle,
          x,
          y,
        };
      });
      return spreadLayoutForDatasetViewport(input, layout);
    },
  };
}

/**
 * Build a stronger-relaxation variant of the deterministic layout for larger graphs.
 */
function createCommunityForceStrategy(): GraphLayoutStrategy {
  return {
    id: COMMUNITY_FORCE_GRAPH_LAYOUT_STRATEGY_ID,
    computeLayout(input) {
      const baseLayout = createProbabilityDeterministicStrategy().computeLayout(input);
      return spreadLayoutForDatasetViewport(input, baseLayout);
    },
  };
}

/**
 * Build a radial anchor layout that keeps high-coupling nodes near the top arc.
 */
function createRadialAnchorStrategy(): GraphLayoutStrategy {
  return {
    id: RADIAL_ANCHOR_GRAPH_LAYOUT_STRATEGY_ID,
    computeLayout(input) {
      const baseLayout = createRadialFallbackStrategy().computeLayout(input);
      return spreadLayoutForDatasetViewport(input, baseLayout);
    },
  };
}

/**
 * Purpose: Create a deterministic radial fallback layout when the primary strategy is unavailable.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function createRadialFallbackStrategy(): GraphLayoutStrategy {
  return {
    id: RADIAL_FALLBACK_STRATEGY_ID,
    computeLayout(input) {
      const centerX = input.width / 2;
      const centerY = input.height * GRAPH_LAYOUT_CENTER_Y_RATIO;
      const radius = Math.min(input.width, input.height) * 0.34;

      return Array.from({ length: input.nodeCount }, (_, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, input.nodeCount);
        return {
          index,
          angle,
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      });
    },
  };
}

/**
 * Purpose: Pick the most coupled node to anchor at layout center.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function pickCenterNodeIndex(matrix: number[][], nodeCount: number): number {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < nodeCount; index += 1) {
    let score = 0;
    for (let other = 0; other < nodeCount; other += 1) {
      if (index === other) continue;
      const out = clampProbability(matrix[index]?.[other] ?? 0);
      const incoming = clampProbability(matrix[other]?.[index] ?? 0);
      score += out + incoming;
    }
    if (score > bestScore + LAYOUT_EPSILON) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

/**
 * Purpose: Seed node coordinates before iterative relaxation starts.
 * Inputs: Layout input, center anchor, center-node index, and mutable position buffer.
 * Returns: No value (`void`).
 * Side effects: Mutates `positions` with deterministic initial node coordinates.
 */
function seedInitialPositions(options: {
  input: GraphLayoutInput;
  center: Point;
  centerNodeIndex: number;
  positions: Point[];
}): void {
  const { input, center, centerNodeIndex, positions } = options;
  positions[centerNodeIndex] = { ...center };

  const outerIndices = Array.from({ length: input.nodeCount }, (_, index) => index).filter(
    (index) => index !== centerNodeIndex
  );
  if (outerIndices.length === 0) {
    return;
  }

  const orderedOuterIndices = orderOuterNodesByCoupling(
    input.transitionMatrix,
    centerNodeIndex,
    outerIndices
  );

  const radiusX = Math.min(input.width * 0.44, Math.max(120, input.maxEdgeLength * 0.78));
  const radiusY = Math.min(input.height * 0.4, Math.max(94, input.maxEdgeLength * 0.64));

  orderedOuterIndices.forEach((index, order) => {
    const angle = -Math.PI / 2 + (order * 2 * Math.PI) / orderedOuterIndices.length;
    positions[index] = {
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
    };
  });
}

/**
 * Purpose: Order non-center nodes by coupling so initial placement is stable.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function orderOuterNodesByCoupling(
  matrix: number[][],
  centerNodeIndex: number,
  outerIndices: number[]
): number[] {
  const remaining = new Set<number>(outerIndices);
  const ordered: number[] = [];

  let current = pickStrongestCoupledNode(matrix, centerNodeIndex, remaining);
  if (current === null) {
    return [...outerIndices].sort((left, right) => left - right);
  }

  while (current !== null) {
    ordered.push(current);
    remaining.delete(current);
    current = pickStrongestCoupledNode(matrix, current, remaining);
  }

  return ordered;
}

/**
 * Purpose: Pick the candidate node with strongest pairwise coupling to the reference node.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function pickStrongestCoupledNode(
  matrix: number[][],
  referenceIndex: number,
  candidates: Set<number>
): number | null {
  let bestCandidate: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  Array.from(candidates)
    .sort((left, right) => left - right)
    .forEach((candidate) => {
      const score = pairCoupling(matrix, referenceIndex, candidate);
      if (score > bestScore + LAYOUT_EPSILON) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

  return bestCandidate;
}

/**
 * Purpose: Build desired pairwise distances from transition probabilities.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function buildTargetDistanceMatrix(input: GraphLayoutInput, centerNodeIndex: number): number[][] {
  const distances = Array.from({ length: input.nodeCount }, () =>
    Array.from({ length: input.nodeCount }, () => input.minEdgeLength)
  );

  for (let left = 0; left < input.nodeCount; left += 1) {
    for (let right = left + 1; right < input.nodeCount; right += 1) {
      const coupling = pairCoupling(input.transitionMatrix, left, right);
      const target = probabilityToEdgeLength(coupling, input.minEdgeLength, input.maxEdgeLength);
      const centerScale = left === centerNodeIndex || right === centerNodeIndex ? 0.84 : 1;
      const scaled = target * centerScale;
      distances[left][right] = scaled;
      distances[right][left] = scaled;
    }
  }

  return distances;
}

/**
 * Purpose: Iteratively relax node positions using spring, repulsion, and center-pull forces.
 * Inputs: Layout context plus mutable `positions` and `velocities` buffers.
 * Returns: No value (`void`).
 * Side effects: Mutates `positions` and `velocities` during iterative force simulation.
 */
function relaxPositions(options: {
  input: GraphLayoutInput;
  center: Point;
  centerNodeIndex: number;
  positions: Point[];
  velocities: Point[];
  targetDistances: number[][];
}): void {
  const { input, center, centerNodeIndex, positions, velocities, targetDistances } = options;

  const margin = input.nodeRadius + 22;
  const minX = margin;
  const maxX = input.width - margin;
  const minY = margin;
  const maxY = input.height - margin;
  const minSeparation = input.nodeRadius * 2.72;

  const iterations = input.nodeCount <= 16 ? 240 : 150;
  const springStrength = 0.05;
  const repelStrength = 5000;
  const centerPullStrength = 0.003;
  const damping = 0.9;
  const maxStep = 11;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < input.nodeCount; index += 1) {
      if (index === centerNodeIndex) {
        positions[index] = { ...center };
        velocities[index] = { x: 0, y: 0 };
        continue;
      }

      let fx = 0;
      let fy = 0;
      const current = positions[index];

      for (let other = 0; other < input.nodeCount; other += 1) {
        if (other === index) continue;
        const neighbor = positions[other];

        const dx = neighbor.x - current.x;
        const dy = neighbor.y - current.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / distance;
        const uy = dy / distance;

        const targetDistance = targetDistances[index][other];
        const springForce = (distance - targetDistance) * springStrength;
        fx += ux * springForce;
        fy += uy * springForce;

        const repulsion = repelStrength / (distance * distance);
        fx -= ux * repulsion;
        fy -= uy * repulsion;
      }

      fx += (center.x - current.x) * centerPullStrength;
      fy += (center.y - current.y) * centerPullStrength;

      const velocity = velocities[index];
      velocity.x = (velocity.x + fx) * damping;
      velocity.y = (velocity.y + fy) * damping;

      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > maxStep) {
        const scale = maxStep / speed;
        velocity.x *= scale;
        velocity.y *= scale;
      }

      current.x = clamp(current.x + velocity.x, minX, maxX);
      current.y = clamp(current.y + velocity.y, minY, maxY);
    }

    enforceNodeSeparation({
      positions,
      centerNodeIndex,
      minSeparation,
      minX,
      maxX,
      minY,
      maxY,
      center,
    });
  }
}

/**
 * Purpose: Resolve overlaps so node centers stay above the minimum spacing threshold.
 * Inputs: Mutable position buffer, spacing constraints, and center-node metadata.
 * Returns: No value (`void`).
 * Side effects: Mutates node coordinates in `positions` to enforce minimum separation.
 */
function enforceNodeSeparation(options: {
  positions: Point[];
  centerNodeIndex: number;
  minSeparation: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  center: Point;
}): void {
  const { positions, centerNodeIndex, minSeparation, minX, maxX, minY, maxY, center } = options;

  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      const leftPoint = positions[left];
      const rightPoint = positions[right];
      const dx = rightPoint.x - leftPoint.x;
      const dy = rightPoint.y - leftPoint.y;
      const distance = Math.max(1e-5, Math.hypot(dx, dy));
      if (distance >= minSeparation) continue;

      const overlap = (minSeparation - distance) / 2;
      const ux = dx / distance;
      const uy = dy / distance;

      if (left === centerNodeIndex) {
        rightPoint.x = clamp(rightPoint.x + ux * overlap * 2, minX, maxX);
        rightPoint.y = clamp(rightPoint.y + uy * overlap * 2, minY, maxY);
      } else if (right === centerNodeIndex) {
        leftPoint.x = clamp(leftPoint.x - ux * overlap * 2, minX, maxX);
        leftPoint.y = clamp(leftPoint.y - uy * overlap * 2, minY, maxY);
      } else {
        leftPoint.x = clamp(leftPoint.x - ux * overlap, minX, maxX);
        leftPoint.y = clamp(leftPoint.y - uy * overlap, minY, maxY);
        rightPoint.x = clamp(rightPoint.x + ux * overlap, minX, maxX);
        rightPoint.y = clamp(rightPoint.y + uy * overlap, minY, maxY);
      }
    }
  }

  positions[centerNodeIndex] = { ...center };
}

/**
 * Purpose: Compute the preferred self-loop angle from node direction and crowding.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function computeLoopAngle(
  index: number,
  centerNodeIndex: number,
  positions: Point[],
  matrix: number[][],
  center: Point
): number {
  const node = positions[index];
  if (index !== centerNodeIndex) {
    return Math.atan2(node.y - center.y, node.x - center.x);
  }

  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (let other = 0; other < positions.length; other += 1) {
    if (other === index) continue;
    const outgoing = clampProbability(matrix[index]?.[other] ?? 0);
    const incoming = clampProbability(matrix[other]?.[index] ?? 0);
    const weight = Math.max(0.01, outgoing + incoming);
    weightedX += positions[other].x * weight;
    weightedY += positions[other].y * weight;
    totalWeight += weight;
  }

  if (totalWeight <= LAYOUT_EPSILON) {
    return -Math.PI / 2;
  }

  const crowdX = weightedX / totalWeight;
  const crowdY = weightedY / totalWeight;
  return Math.atan2(node.y - crowdY, node.x - crowdX);
}

/**
 * Purpose: Compute symmetric coupling strength for a node pair.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function pairCoupling(matrix: number[][], left: number, right: number): number {
  if (left === right) return 1;
  const forward = clampProbability(matrix[left]?.[right] ?? 0);
  const backward = clampProbability(matrix[right]?.[left] ?? 0);
  return Math.max(forward, backward);
}

/**
 * Linearly interpolate between scalar values.
 */
function lerp(fromValue: number, toValue: number, progress: number): number {
  return fromValue + (toValue - fromValue) * progress;
}

/**
 * Purpose: Clamp a numeric value into an inclusive [min, max] range.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function clamp(value: number, min: number, max: number): number {
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

/**
 * Spread dataset-layout nodes outward until the default viewport includes at most a bounded count.
 */
function spreadLayoutForDatasetViewport(
  input: GraphLayoutInput,
  layout: GraphNodeLayout[]
): GraphNodeLayout[] {
  if (layout.length <= DATASET_DEFAULT_MAX_VISIBLE_NODES) {
    return layout;
  }

  const pivot = resolveLayoutPivot(input, layout);
  const visibleAtScaleOne = countDefaultViewportVisibleNodes(input, layout);
  if (visibleAtScaleOne <= DATASET_DEFAULT_MAX_VISIBLE_NODES) {
    return layout;
  }

  let lowScale = 1;
  let highScale = 1;
  let highVisible = visibleAtScaleOne;
  while (
    highVisible > DATASET_DEFAULT_MAX_VISIBLE_NODES &&
    highScale < DATASET_SPREAD_MAX_SCALE
  ) {
    highScale *= 1.35;
    highVisible = countDefaultViewportVisibleNodes(input, scaleLayout(layout, pivot, highScale));
  }

  if (highVisible > DATASET_DEFAULT_MAX_VISIBLE_NODES) {
    return scaleLayout(layout, pivot, highScale);
  }

  for (let step = 0; step < DATASET_SPREAD_BINARY_SEARCH_STEPS; step += 1) {
    const mid = (lowScale + highScale) / 2;
    const visible = countDefaultViewportVisibleNodes(input, scaleLayout(layout, pivot, mid));
    if (visible > DATASET_DEFAULT_MAX_VISIBLE_NODES) {
      lowScale = mid;
    } else {
      highScale = mid;
    }
  }

  return scaleLayout(layout, pivot, highScale);
}

function resolveLayoutPivot(input: GraphLayoutInput, layout: GraphNodeLayout[]): Point {
  if (layout.length <= 0) {
    return {
      x: input.width / 2,
      y: input.height * GRAPH_LAYOUT_CENTER_Y_RATIO,
    };
  }
  const sum = layout.reduce(
    (acc, node) => {
      acc.x += node.x;
      acc.y += node.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return {
    x: sum.x / layout.length,
    y: sum.y / layout.length,
  };
}

function scaleLayout(
  layout: GraphNodeLayout[],
  pivot: Point,
  scale: number
): GraphNodeLayout[] {
  if (Math.abs(scale - 1) <= LAYOUT_EPSILON) {
    return layout;
  }
  return layout.map((node) => ({
    ...node,
    x: pivot.x + (node.x - pivot.x) * scale,
    y: pivot.y + (node.y - pivot.y) * scale,
  }));
}

function countDefaultViewportVisibleNodes(
  input: GraphLayoutInput,
  layout: GraphNodeLayout[]
): number {
  const radius = input.nodeRadius;
  let count = 0;
  layout.forEach((node) => {
    const intersectsViewport =
      node.x + radius >= 0 &&
      node.x - radius <= input.width &&
      node.y + radius >= 0 &&
      node.y - radius <= input.height;
    if (intersectsViewport) {
      count += 1;
    }
  });
  return count;
}


