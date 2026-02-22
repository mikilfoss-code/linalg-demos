export const MIN_NODE_COUNT = 2;
export const MAX_NODE_COUNT = 10;
export const DEFAULT_NODE_COUNT = 4;

const VALUE_EPSILON = 1e-9;
const PROBABILITY_SUM_TOLERANCE = 1e-4;
const PARTICLE_MASS_THRESHOLD = 0.012;
const FLOW_PARTICLE_RADIUS = 2.2;
const FLOW_GLOB_MAX_PARTICLES = 16;
const FLOW_NODE_TOTAL_PARTICLE_BUDGET = 64;
const FLOW_GLOB_MIN_SEPARATION = 0.35;
const FLOW_GLOB_STRETCH_ALONG_RATIO = 1.65;
const FLOW_GLOB_STRETCH_NORMAL_RATIO = 0.45;
const FLOW_GLOB_SOURCE_SIZE_SCALE = 0.95;
const FLOW_GLOB_EDGE_SPREAD_MIN = 0.34;
const FLOW_GLOB_EDGE_SPREAD_MAX = 1.05;
const FLOW_GLOB_EDGE_SPREAD_EXPONENT = 1.25;
const FLOW_GLOB_SPREAD_EXPANSION = 0.72;
const FLOW_GLOB_STEP_SPACING_VARIATION_MIN = 0.92;
const FLOW_GLOB_STEP_SPACING_VARIATION_MAX = 1.14;
const FLOW_GLOB_PARTICLE_ALONG_JITTER = 0.22;
const FLOW_GLOB_PARTICLE_NORMAL_JITTER = 0.34;
const FLOW_GLOB_PATH_PHASE_STEP = 0.05;
const FLOW_GLOB_PATH_PHASE_JITTER = 0.08;
const FLOW_GLOB_MAX_PATH_PHASE = 0.45;

/**
 * Purpose: GlobSlot object contract.
 * Key fields: Properties declared inside this type definition.
 */
type GlobSlot = {
  x: number;
  y: number;
};

const FLOW_GLOB_SLOT_COORDS: readonly GlobSlot[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 2, y: 0 },
  { x: -2, y: 0 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
  { x: 3, y: 0 },
  { x: -3, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: -2 },
  { x: 2, y: 1 },
  { x: -2, y: 1 },
  { x: 2, y: -1 },
  { x: -2, y: -1 },
];

/**
 * Purpose: ValidationSummary object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type ValidationSummary = {
  matrixValid: boolean;
  initialVectorValid: boolean;
  currentVectorValid: boolean;
  canStep: boolean;
  rowSums: number[];
  initialVectorSum: number;
  currentVectorSum: number;
  errors: string[];
};

/**
 * Purpose: FlowEdge object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type FlowEdge = {
  from: number;
  to: number;
  probability: number;
  mass: number;
  pathKey: string;
};

/**
 * Purpose: FlowParticle object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type FlowParticle = {
  id: string;
  pathKey: string;
  delayMs: number;
  durationMs: number;
  radius: number;
  pathPhase: number;
  offsetNormal: number;
};

/**
 * Purpose: FlowAnimationState object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type FlowAnimationState = {
  id: number;
  fromVector: number[];
  toVector: number[];
  edges: FlowEdge[];
  particles: FlowParticle[];
  durationMs: number;
};

/**
 * Clamp an untrusted numeric value to a non-negative scalar.
 */
export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value;
}

/**
 * Build a deterministic edge key used by both graph rendering and flow animation.
 */
export function edgePathKey(from: number, to: number): string {
  return `edge-${from}-${to}`;
}

/**
 * Create the default row-stochastic matrix for a given node count.
 */
export function createDefaultMatrix(nodeCount: number): number[][] {
  const count = clampNodeCount(nodeCount);
  if (count === 2) {
    return [
      [0.7, 0.3],
      [0.25, 0.75],
    ];
  }

  const matrix: number[][] = Array.from({ length: count }, () =>
    Array.from({ length: count }, () => 0)
  );
  for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
    matrix[rowIndex][rowIndex] = 0.48;
    matrix[rowIndex][(rowIndex + 1) % count] += 0.34;
    matrix[rowIndex][(rowIndex + count - 1) % count] += 0.18;
  }

  return matrix.map(normalizeProbabilityVector);
}

/**
 * Create the default initial distribution used for both x0 and current state.
 */
export function createDefaultVector(nodeCount: number): number[] {
  const count = clampNodeCount(nodeCount);
  const vector = Array.from({ length: count }, () => 0);
  vector[0] = 1;
  return vector;
}

/**
 * Resize a matrix while preserving existing values when possible.
 */
export function resizeMatrixToNodeCount(matrix: number[][], nodeCount: number): number[][] {
  const count = clampNodeCount(nodeCount);
  const resized: number[][] = Array.from({ length: count }, (_, rowIndex) => {
    const row = Array.from({ length: count }, (_, colIndex) => matrix[rowIndex]?.[colIndex] ?? 0);
    const normalized = normalizeProbabilityVector(row);
    if (sumVector(normalized) <= VALUE_EPSILON) {
      normalized[rowIndex] = 1;
    }
    return normalizeProbabilityVector(normalized);
  });
  return resized;
}

/**
 * Resize a probability vector and keep it normalized.
 */
export function resizeVectorToNodeCount(vector: number[], nodeCount: number): number[] {
  const count = clampNodeCount(nodeCount);
  const resized = Array.from({ length: count }, (_, index) => clampProbability(vector[index] ?? 0));
  if (sumVector(resized) <= VALUE_EPSILON) {
    return createDefaultVector(count);
  }
  return normalizeProbabilityVector(resized);
}

/**
 * Normalize a probability vector so values sum to 1.
 */
export function normalizeProbabilityVector(vector: number[]): number[] {
  const sanitized = vector.map(clampProbability);
  const total = sumVector(sanitized);
  if (total <= VALUE_EPSILON) {
    return sanitized;
  }
  return sanitized.map((value) => value / total);
}

/**
 * Multiply a row-vector state by a row-stochastic transition matrix.
 */
export function stepVector(currentVector: number[], transitionMatrix: number[][]): number[] {
  const size = currentVector.length;
  const next = Array.from({ length: size }, () => 0);

  for (let fromIndex = 0; fromIndex < size; fromIndex += 1) {
    const mass = currentVector[fromIndex] ?? 0;
    if (mass <= VALUE_EPSILON) continue;

    const row = transitionMatrix[fromIndex] ?? [];
    for (let toIndex = 0; toIndex < size; toIndex += 1) {
      next[toIndex] += mass * (row[toIndex] ?? 0);
    }
  }

  return normalizeProbabilityVector(next);
}

/**
 * Build validation diagnostics used to gate step/analyze actions.
 */
export function buildValidationSummary(
  matrix: number[][],
  initialVector: number[],
  currentVector: number[]
): ValidationSummary {
  const errors: string[] = [];
  const nodeCount = matrix.length;
  const rowSums = matrix.map((row) => sumVector(row));

  let matrixValid = true;
  for (let rowIndex = 0; rowIndex < nodeCount; rowIndex += 1) {
    const row = matrix[rowIndex];
    if (!Array.isArray(row) || row.length !== nodeCount) {
      matrixValid = false;
      errors.push(`Row ${rowIndex + 1} must have ${nodeCount} entries.`);
      continue;
    }

    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const value = row[colIndex];
      if (!Number.isFinite(value)) {
        matrixValid = false;
        errors.push(`P[${rowIndex + 1}, ${colIndex + 1}] must be finite.`);
      } else if (value < -VALUE_EPSILON) {
        matrixValid = false;
        errors.push(`P[${rowIndex + 1}, ${colIndex + 1}] must be non-negative.`);
      }
    }

    if (Math.abs(rowSums[rowIndex] - 1) > PROBABILITY_SUM_TOLERANCE) {
      matrixValid = false;
      errors.push(`Row ${rowIndex + 1} must sum to 1.`);
    }
  }

  const initialVectorResult = validateProbabilityVector(
    initialVector,
    nodeCount,
    'Initial state vector'
  );
  const currentVectorResult = validateProbabilityVector(
    currentVector,
    nodeCount,
    'Current state vector'
  );

  errors.push(...initialVectorResult.errors, ...currentVectorResult.errors);

  const initialVectorValid = initialVectorResult.valid;
  const currentVectorValid = currentVectorResult.valid;

  return {
    matrixValid,
    initialVectorValid,
    currentVectorValid,
    canStep: matrixValid && currentVectorValid,
    rowSums,
    initialVectorSum: initialVectorResult.sum,
    currentVectorSum: currentVectorResult.sum,
    errors,
  };
}

/**
 * Build flow edges and particles for the animated state transition.
 */
export function createFlowAnimation(
  id: number,
  fromVector: number[],
  toVector: number[],
  matrix: number[][]
): FlowAnimationState {
  const edges: FlowEdge[] = [];

  for (let fromIndex = 0; fromIndex < fromVector.length; fromIndex += 1) {
    const sourceMass = fromVector[fromIndex] ?? 0;
    if (sourceMass <= VALUE_EPSILON) continue;

    const row = matrix[fromIndex] ?? [];
    for (let toIndex = 0; toIndex < row.length; toIndex += 1) {
      const probability = row[toIndex] ?? 0;
      if (probability <= VALUE_EPSILON) continue;
      const mass = sourceMass * probability;
      if (mass <= VALUE_EPSILON) continue;
      edges.push({
        from: fromIndex,
        to: toIndex,
        probability,
        mass,
        pathKey: edgePathKey(fromIndex, toIndex),
      });
    }
  }

  const particles: FlowParticle[] = [];
  let maxTravelMs = 950;
  const eligibleEdges = edges
    .filter((edge) => edge.mass >= PARTICLE_MASS_THRESHOLD)
    .sort((left, right) => right.mass - left.mass);
  const particleCountsByPathKey = allocateParticleCountsBySourceNode({
    animationId: id,
    fromVector,
    edges: eligibleEdges,
  });

  eligibleEdges.forEach((edge, edgeIndex) => {
    const edgeSeed = (id + 17) * (edgeIndex + 11);
    const sourceValue = clampProbability(fromVector[edge.from] ?? 0);
    const particleCount = particleCountsByPathKey.get(edge.pathKey) ?? 0;
    if (particleCount <= 0) {
      return;
    }
    const edgeSpreadScale =
      FLOW_GLOB_EDGE_SPREAD_MIN +
      Math.pow(clampProbability(edge.probability), FLOW_GLOB_EDGE_SPREAD_EXPONENT) *
        (FLOW_GLOB_EDGE_SPREAD_MAX - FLOW_GLOB_EDGE_SPREAD_MIN);
    const spreadScale =
      1 + sourceValue * FLOW_GLOB_SOURCE_SIZE_SCALE + edgeSpreadScale * FLOW_GLOB_SPREAD_EXPANSION;
    const baseSpacing = FLOW_PARTICLE_RADIUS * 2 + FLOW_GLOB_MIN_SEPARATION;
    const alongStep = baseSpacing * FLOW_GLOB_STRETCH_ALONG_RATIO * spreadScale;
    const normalStep = baseSpacing * FLOW_GLOB_STRETCH_NORMAL_RATIO * spreadScale;
    const alongPhaseScale =
      alongStep / Math.max(VALUE_EPSILON, baseSpacing * FLOW_GLOB_STRETCH_ALONG_RATIO);
    const delayMs = 26 + pseudoRandom(edgeSeed + 13) * 168;
    const durationMs = 520 + pseudoRandom(edgeSeed + 101) * 300;
    const slotCount = FLOW_GLOB_SLOT_COORDS.length;
    const slotRotation = Math.floor(pseudoRandom(edgeSeed + 211) * slotCount);
    const slotStride = 1 + Math.floor(pseudoRandom(edgeSeed + 223) * Math.max(1, slotCount - 1));
    const slotDirection = pseudoRandom(edgeSeed + 227) < 0.5 ? 1 : -1;
    const stepSpacingVariation =
      FLOW_GLOB_STEP_SPACING_VARIATION_MIN +
      pseudoRandom(edgeSeed + 233) *
        (FLOW_GLOB_STEP_SPACING_VARIATION_MAX - FLOW_GLOB_STEP_SPACING_VARIATION_MIN);
    const variedNormalStep = normalStep * stepSpacingVariation;
    maxTravelMs = Math.max(maxTravelMs, delayMs + durationMs);

    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const slotIndex = positiveModulo(
        slotRotation + slotDirection * particleIndex * slotStride,
        slotCount
      );
      const slot =
        FLOW_GLOB_SLOT_COORDS[slotIndex] ?? FLOW_GLOB_SLOT_COORDS[FLOW_GLOB_SLOT_COORDS.length - 1];
      const phaseJitter =
        (pseudoRandom(edgeSeed + 307 + particleIndex * 17) - 0.5) *
        FLOW_GLOB_PARTICLE_ALONG_JITTER *
        FLOW_GLOB_PATH_PHASE_JITTER;
      const pathPhase = clamp(
        slot.x * FLOW_GLOB_PATH_PHASE_STEP * alongPhaseScale * stepSpacingVariation + phaseJitter,
        -FLOW_GLOB_MAX_PATH_PHASE,
        FLOW_GLOB_MAX_PATH_PHASE
      );
      const normalJitter =
        1 +
        (pseudoRandom(edgeSeed + 401 + particleIndex * 19) - 0.5) *
          FLOW_GLOB_PARTICLE_NORMAL_JITTER;

      particles.push({
        id: `particle-${id}-${edge.from}-${edge.to}-${particleIndex}`,
        pathKey: edge.pathKey,
        delayMs,
        durationMs,
        radius: FLOW_PARTICLE_RADIUS,
        pathPhase,
        offsetNormal: slot.y * variedNormalStep * normalJitter,
      });
    }
  });

  return {
    id,
    fromVector: [...fromVector],
    toVector: [...toVector],
    edges,
    particles,
    durationMs: maxTravelMs + 40,
  };
}

/**
 * Purpose: Allocate per-edge particle counts from source-node budgets with per-edge caps.
 * Inputs: Current animation id, source distribution, and eligible flow edges.
 * Returns: Map from edge path key to allocated particle count.
 * Side effects: None (pure computation).
 */
function allocateParticleCountsBySourceNode(options: {
  animationId: number;
  fromVector: readonly number[];
  edges: readonly FlowEdge[];
}): Map<string, number> {
  const bySourceNode = new Map<number, FlowEdge[]>();
  options.edges.forEach((edge) => {
    const existing = bySourceNode.get(edge.from);
    if (existing) {
      existing.push(edge);
    } else {
      bySourceNode.set(edge.from, [edge]);
    }
  });

  const countsByPathKey = new Map<string, number>();
  bySourceNode.forEach((sourceEdges, sourceNodeIndex) => {
    const sourceValue = clampProbability(options.fromVector[sourceNodeIndex] ?? 0);
    if (sourceValue <= VALUE_EPSILON) {
      return;
    }

    const rawBudget = Math.round(sourceValue * FLOW_NODE_TOTAL_PARTICLE_BUDGET);
    if (rawBudget <= 0) {
      return;
    }

    const maxBudget = sourceEdges.length * FLOW_GLOB_MAX_PARTICLES;
    const nodeBudget = Math.min(rawBudget, maxBudget);
    if (nodeBudget <= 0) {
      return;
    }

    const allocations = allocateCappedWeightedCounts({
      totalCount: nodeBudget,
      maxPerBucket: FLOW_GLOB_MAX_PARTICLES,
      weights: sourceEdges.map((edge) => clampProbability(edge.probability)),
      seed: (options.animationId + 31) * (sourceNodeIndex + 41),
    });

    allocations.forEach((count, edgeIndex) => {
      if (count <= 0) {
        return;
      }
      countsByPathKey.set(sourceEdges[edgeIndex].pathKey, count);
    });
  });

  return countsByPathKey;
}

/**
 * Purpose: Randomly allocate an integer budget across weighted buckets with hard bucket caps.
 * Inputs: Allocation budget, per-bucket cap, bucket weights, and deterministic seed.
 * Returns: Integer counts per bucket summing to <= totalCount.
 * Side effects: None (pure computation).
 */
function allocateCappedWeightedCounts(options: {
  totalCount: number;
  maxPerBucket: number;
  weights: readonly number[];
  seed: number;
}): number[] {
  const bucketCount = options.weights.length;
  const counts = Array.from({ length: bucketCount }, () => 0);
  if (bucketCount === 0 || options.totalCount <= 0 || options.maxPerBucket <= 0) {
    return counts;
  }

  let remaining = options.totalCount;
  let drawIndex = 0;
  const random = () => {
    drawIndex += 1;
    return pseudoRandom(options.seed + drawIndex * 97);
  };

  while (remaining > 0) {
    const availableIndices: number[] = [];
    const availableWeights: number[] = [];
    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
      if (counts[bucketIndex] >= options.maxPerBucket) {
        continue;
      }
      const weight = clampProbability(options.weights[bucketIndex] ?? 0);
      if (weight <= VALUE_EPSILON) {
        continue;
      }
      availableIndices.push(bucketIndex);
      availableWeights.push(weight);
    }

    if (availableIndices.length === 0) {
      for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
        if (counts[bucketIndex] >= options.maxPerBucket) {
          continue;
        }
        availableIndices.push(bucketIndex);
        availableWeights.push(1);
      }
    }

    if (availableIndices.length === 0) {
      break;
    }

    const pickedLocalIndex = sampleWeightedIndex(availableWeights, random());
    const pickedBucketIndex = availableIndices[pickedLocalIndex];
    counts[pickedBucketIndex] += 1;
    remaining -= 1;
  }

  return counts;
}

/**
 * Purpose: Sample a bucket index from normalized or unnormalized non-negative weights.
 * Inputs: Candidate bucket weights and random scalar in [0, 1).
 * Returns: Selected bucket index.
 * Side effects: None (pure computation).
 */
function sampleWeightedIndex(weights: readonly number[], randomValue: number): number {
  if (weights.length === 0) {
    return 0;
  }

  let totalWeight = 0;
  weights.forEach((weight) => {
    totalWeight += Math.max(0, weight);
  });

  if (totalWeight <= VALUE_EPSILON) {
    return Math.floor(clamp(randomValue, 0, 0.999999) * weights.length);
  }

  let threshold = clamp(randomValue, 0, 0.999999) * totalWeight;
  for (let index = 0; index < weights.length; index += 1) {
    threshold -= Math.max(0, weights[index]);
    if (threshold <= 0) {
      return index;
    }
  }

  return weights.length - 1;
}

/**
 * Format a probability for compact UI display.
 */
export function formatProbability(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.000';
}

/**
 * Compute an interpolated color for node fill from probability mass.
 */
export function colorForStateValue(value: number): string {
  const normalized = clampProbability(value);
  const hue = 206;
  const saturation = 68;
  const lightness = 93 - normalized * 56;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
}

/**
 * Interpolate linearly between two scalar values.
 */
export function lerp(fromValue: number, toValue: number, progress: number): number {
  return fromValue + (toValue - fromValue) * progress;
}

/**
 * Normalize an integer node-count request into the supported [2, 8] range.
 */
export function clampNodeCount(nodeCount: number): number {
  if (!Number.isFinite(nodeCount)) return DEFAULT_NODE_COUNT;
  const rounded = Math.round(nodeCount);
  if (rounded < MIN_NODE_COUNT) return MIN_NODE_COUNT;
  if (rounded > MAX_NODE_COUNT) return MAX_NODE_COUNT;
  return rounded;
}

/**
 * Purpose: validateProbabilityVector function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function validateProbabilityVector(vector: number[], expectedLength: number, label: string) {
  const errors: string[] = [];

  if (vector.length !== expectedLength) {
    errors.push(`${label} must have ${expectedLength} entries.`);
    return {
      valid: false,
      sum: sumVector(vector),
      errors,
    };
  }

  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    if (!Number.isFinite(value)) {
      errors.push(`${label} entries must be finite.`);
      continue;
    }
    if (value < -VALUE_EPSILON) {
      errors.push(`${label} entries must be non-negative.`);
    }
  }

  const sum = sumVector(vector);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) {
    errors.push(`${label} must sum to 1.`);
  }

  return {
    valid: errors.length === 0,
    sum,
    errors,
  };
}

/**
 * Purpose: sumVector function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function sumVector(vector: readonly number[]): number {
  return vector.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

/**
 * Purpose: Normalize modulo output into the [0, modulus) range.
 * Inputs: Raw integer-like value and positive modulus.
 * Returns: Wrapped non-negative remainder.
 * Side effects: None (pure computation).
 */
function positiveModulo(value: number, modulus: number): number {
  if (modulus <= 0) {
    return 0;
  }
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/**
 * Purpose: Clamp a scalar into an inclusive [min, max] interval.
 * Inputs: Value and numeric bounds.
 * Returns: Clamped scalar result.
 * Side effects: None (pure computation).
 */
function clamp(value: number, min: number, max: number): number {
  if (value <= min) {
    return min;
  }
  if (value >= max) {
    return max;
  }
  return value;
}

/**
 * Purpose: pseudoRandom function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
