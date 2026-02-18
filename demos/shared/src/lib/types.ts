export type Vec = number[];
export type Mat = number[][];

export interface HealthResponse { status: string; }

export interface MatrixApplyRequest { matrix: Mat; vector: Vec; }
export interface MatrixApplyResponse { result: Vec; }

export interface EigenRequest { matrix: Mat; }
export interface EigenResponse {
  eigenvalues: number[];
  eigenvectors: Mat; // columns are eigenvectors
}

/**
 * Purpose: isFiniteNumber function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
/**
 * Purpose: isVec function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isVec(x: unknown): x is Vec {
  return Array.isArray(x) && x.every(isFiniteNumber);
}
/**
 * Purpose: isMat function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isMat(x: unknown): x is Mat {
  return Array.isArray(x) && x.every(r => Array.isArray(r) && r.every(isFiniteNumber));
}
/**
 * Purpose: isNonNegativeInt function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isNonNegativeInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}
/**
 * Purpose: isByte function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isByte(x: unknown): x is number {
  return isNonNegativeInt(x) && x <= 255;
}
/**
 * Purpose: isByteVec function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isByteVec(x: unknown): x is number[] {
  return Array.isArray(x) && x.every(isByte);
}
/**
 * Purpose: isString function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function isString(x: unknown): x is string {
  return typeof x === "string";
}
/**
 * Purpose: assert function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
