export type Matrix = number[][];
export type Vector = number[];

const EPSILON = 1e-9;

export type DirectedEdge = {
  from: number;
  to: number;
};

export type RrefResult = {
  matrix: Matrix;
  pivotColumns: number[];
};

/**
 * Build a node-row/edge-column directed incidence matrix.
 */
export function buildDirectedIncidenceMatrix(
  nodeCount: number,
  edges: readonly DirectedEdge[]
): Matrix {
  const matrix: Matrix = Array.from({ length: nodeCount }, () =>
    Array.from({ length: edges.length }, () => 0)
  );

  edges.forEach((edge, edgeIndex) => {
    matrix[edge.from][edgeIndex] = -1;
    matrix[edge.to][edgeIndex] = 1;
  });

  return matrix;
}

/**
 * Multiply a matrix by a column vector.
 */
export function multiplyMatrixVector(matrix: readonly (readonly number[])[], vector: readonly number[]): Vector {
  const rowCount = matrix.length;
  if (rowCount === 0) {
    return [];
  }
  const colCount = matrix[0]?.length ?? 0;
  if (vector.length !== colCount) {
    throw new Error(`Matrix/vector dimension mismatch. Expected vector length ${colCount}, received ${vector.length}.`);
  }

  return matrix.map((row) => {
    if (row.length !== colCount) {
      throw new Error('Matrix must be rectangular.');
    }
    let sum = 0;
    for (let index = 0; index < colCount; index += 1) {
      sum += row[index] * vector[index];
    }
    return sanitizeNearZero(sum);
  });
}

/**
 * Compute reduced row echelon form and pivot columns.
 */
export function computeRref(input: readonly (readonly number[])[]): RrefResult {
  const rowCount = input.length;
  const colCount = rowCount > 0 ? input[0]?.length ?? 0 : 0;
  const matrix = input.map((row) => [...row]);
  const pivotColumns: number[] = [];

  let pivotRow = 0;
  for (let col = 0; col < colCount && pivotRow < rowCount; col += 1) {
    let candidateRow = pivotRow;
    let candidateAbsValue = Math.abs(matrix[candidateRow][col]);

    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      const valueAbs = Math.abs(matrix[row][col]);
      if (valueAbs > candidateAbsValue) {
        candidateAbsValue = valueAbs;
        candidateRow = row;
      }
    }

    if (candidateAbsValue <= EPSILON) {
      continue;
    }

    if (candidateRow !== pivotRow) {
      [matrix[pivotRow], matrix[candidateRow]] = [matrix[candidateRow], matrix[pivotRow]];
    }

    const pivotValue = matrix[pivotRow][col];
    for (let pivotCol = col; pivotCol < colCount; pivotCol += 1) {
      matrix[pivotRow][pivotCol] /= pivotValue;
    }

    for (let row = 0; row < rowCount; row += 1) {
      if (row === pivotRow) {
        continue;
      }
      const factor = matrix[row][col];
      if (Math.abs(factor) <= EPSILON) {
        continue;
      }
      for (let reduceCol = col; reduceCol < colCount; reduceCol += 1) {
        matrix[row][reduceCol] -= factor * matrix[pivotRow][reduceCol];
      }
    }

    pivotColumns.push(col);
    pivotRow += 1;
  }

  return {
    matrix: matrix.map((row) => row.map((value) => sanitizeNearZero(value))),
    pivotColumns,
  };
}

/**
 * Basis vectors for the row space are non-zero rows of rref(matrix).
 */
export function rowSpaceBasis(matrix: readonly (readonly number[])[]): Vector[] {
  const rref = computeRref(matrix).matrix;
  return rref
    .filter((row) => row.some((value) => Math.abs(value) > EPSILON))
    .map((row) => row.map((value) => sanitizeNearZero(value)));
}

/**
 * Basis vectors for the column space are pivot columns from the original matrix.
 */
export function columnSpaceBasis(matrix: readonly (readonly number[])[]): Vector[] {
  if (matrix.length === 0) {
    return [];
  }
  const { pivotColumns } = computeRref(matrix);
  return pivotColumns.map((columnIndex) =>
    matrix.map((row) => sanitizeNearZero(row[columnIndex] ?? 0))
  );
}

/**
 * Basis vectors for the null space from free-variable construction on rref(matrix).
 */
export function nullSpaceBasis(matrix: readonly (readonly number[])[]): Vector[] {
  const rowCount = matrix.length;
  if (rowCount === 0) {
    return [];
  }

  const colCount = matrix[0]?.length ?? 0;
  const { matrix: rref, pivotColumns } = computeRref(matrix);
  const pivotSet = new Set(pivotColumns);
  const freeColumns = Array.from({ length: colCount }, (_, index) => index).filter(
    (index) => !pivotSet.has(index)
  );

  if (freeColumns.length === 0) {
    return [];
  }

  return freeColumns.map((freeColumn) => {
    const basisVector = Array.from({ length: colCount }, () => 0);
    basisVector[freeColumn] = 1;

    pivotColumns.forEach((pivotColumn, pivotRowIndex) => {
      basisVector[pivotColumn] = sanitizeNearZero(-(rref[pivotRowIndex]?.[freeColumn] ?? 0));
    });

    return basisVector;
  });
}

/**
 * Basis vectors for the left null space: Null(M^T).
 */
export function leftNullSpaceBasis(matrix: readonly (readonly number[])[]): Vector[] {
  const rowCount = matrix.length;
  if (rowCount === 0) {
    return [];
  }

  const colCount = matrix[0]?.length ?? 0;
  if (colCount === 0) {
    return standardBasis(rowCount);
  }

  return nullSpaceBasis(transposeMatrix(matrix));
}

export function transposeMatrix(matrix: readonly (readonly number[])[]): Matrix {
  const rowCount = matrix.length;
  if (rowCount === 0) {
    return [];
  }

  const colCount = matrix[0]?.length ?? 0;
  matrix.forEach((row) => {
    if (row.length !== colCount) {
      throw new Error('Matrix must be rectangular.');
    }
  });

  return Array.from({ length: colCount }, (_, colIndex) =>
    matrix.map((row) => sanitizeNearZero(row[colIndex] ?? 0))
  );
}

function standardBasis(dimension: number): Vector[] {
  return Array.from({ length: dimension }, (_, basisIndex) =>
    Array.from({ length: dimension }, (_, index) => (index === basisIndex ? 1 : 0))
  );
}

function sanitizeNearZero(value: number): number {
  if (Math.abs(value) <= EPSILON) {
    return 0;
  }
  return Number(value.toFixed(10));
}
