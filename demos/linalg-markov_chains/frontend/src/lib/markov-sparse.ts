import { normalizeProbabilityVector } from './markov';

const SPARSE_EPSILON = 1e-12;

/**
 * Compressed sparse-row (CSR) transition matrix representation.
 */
export type SparseRowMatrix = {
  size: number;
  rowOffsets: Int32Array;
  columnIndices: Int32Array;
  values: Float64Array;
};

/**
 * Build a CSR matrix from a dense row-stochastic transition matrix.
 */
export function buildSparseRowMatrix(
  transitionMatrix: readonly number[][],
  epsilon = SPARSE_EPSILON
): SparseRowMatrix {
  const size = transitionMatrix.length;
  const rowOffsets = new Int32Array(size + 1);
  const columnIndices: number[] = [];
  const values: number[] = [];

  let nnz = 0;
  for (let fromIndex = 0; fromIndex < size; fromIndex += 1) {
    rowOffsets[fromIndex] = nnz;
    const row = transitionMatrix[fromIndex] ?? [];
    for (let toIndex = 0; toIndex < size; toIndex += 1) {
      const value = row[toIndex] ?? 0;
      if (!Number.isFinite(value) || value <= epsilon) {
        continue;
      }
      columnIndices.push(toIndex);
      values.push(value);
      nnz += 1;
    }
  }
  rowOffsets[size] = nnz;

  return {
    size,
    rowOffsets,
    columnIndices: Int32Array.from(columnIndices),
    values: Float64Array.from(values),
  };
}

/**
 * Multiply a row-vector state by a CSR transition matrix.
 */
export function stepVectorSparse(
  currentVector: readonly number[],
  sparseMatrix: SparseRowMatrix
): number[] {
  const size = sparseMatrix.size;
  const next = Array.from({ length: size }, () => 0);
  const { rowOffsets, columnIndices, values } = sparseMatrix;

  for (let fromIndex = 0; fromIndex < size; fromIndex += 1) {
    const mass = currentVector[fromIndex] ?? 0;
    if (!Number.isFinite(mass) || mass <= 0) {
      continue;
    }
    const start = rowOffsets[fromIndex];
    const end = rowOffsets[fromIndex + 1];
    for (let entryIndex = start; entryIndex < end; entryIndex += 1) {
      const toIndex = columnIndices[entryIndex];
      next[toIndex] += mass * values[entryIndex];
    }
  }

  return normalizeProbabilityVector(next);
}
