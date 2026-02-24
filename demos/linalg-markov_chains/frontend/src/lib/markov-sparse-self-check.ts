import { normalizeTransitionRows, normalizeProbabilityVector, stepVector } from './markov';
import { buildSparseRowMatrix, stepVectorSparse } from './markov-sparse';

export type SparseParitySummary = {
  trialCount: number;
  maxAbsDiff: number;
  denseTotalMs: number;
  sparseTotalMs: number;
};

/**
 * Run deterministic sparse-vs-dense parity and timing checks.
 * This is intended for development diagnostics and not production control flow.
 */
export function runSparseParitySelfCheck(): SparseParitySummary {
  const seeds = [17, 29, 41, 53, 67, 79, 97, 131, 149, 181, 211, 239];
  let maxAbsDiff = 0;
  let denseTotalMs = 0;
  let sparseTotalMs = 0;

  seeds.forEach((seed, index) => {
    const nodeCount = 24 + (index % 4) * 16;
    const density = 0.08 + (index % 3) * 0.05;
    const matrix = buildDeterministicRandomTransitionMatrix(nodeCount, density, seed);
    const currentVector = buildDeterministicRandomVector(nodeCount, seed * 13 + 7);

    const denseStart = performance.now();
    const denseNext = stepVector(currentVector, matrix);
    denseTotalMs += performance.now() - denseStart;

    const sparse = buildSparseRowMatrix(matrix);
    const sparseStart = performance.now();
    const sparseNext = stepVectorSparse(currentVector, sparse);
    sparseTotalMs += performance.now() - sparseStart;

    for (let i = 0; i < nodeCount; i += 1) {
      const diff = Math.abs((denseNext[i] ?? 0) - (sparseNext[i] ?? 0));
      if (diff > maxAbsDiff) {
        maxAbsDiff = diff;
      }
    }
  });

  return {
    trialCount: seeds.length,
    maxAbsDiff,
    denseTotalMs,
    sparseTotalMs,
  };
}

function buildDeterministicRandomTransitionMatrix(
  nodeCount: number,
  density: number,
  seed: number
): number[][] {
  const random = createSeededRandom(seed);
  const matrix: number[][] = Array.from({ length: nodeCount }, (_, rowIndex) => {
    const row = Array.from({ length: nodeCount }, (_, colIndex) => {
      const keep = random() < density || rowIndex === colIndex;
      if (!keep) {
        return 0;
      }
      return random();
    });
    return normalizeProbabilityVector(row);
  });
  return normalizeTransitionRows(matrix);
}

function buildDeterministicRandomVector(nodeCount: number, seed: number): number[] {
  const random = createSeededRandom(seed);
  const raw = Array.from({ length: nodeCount }, () => random());
  return normalizeProbabilityVector(raw);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
