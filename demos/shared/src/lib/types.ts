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

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
export function isVec(x: unknown): x is Vec {
  return Array.isArray(x) && x.every(isFiniteNumber);
}
export function isMat(x: unknown): x is Mat {
  return Array.isArray(x) && x.every(r => Array.isArray(r) && r.every(isFiniteNumber));
}
export function isNonNegativeInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}
export function isByte(x: unknown): x is number {
  return isNonNegativeInt(x) && x <= 255;
}
export function isByteVec(x: unknown): x is number[] {
  return Array.isArray(x) && x.every(isByte);
}
export function isString(x: unknown): x is string {
  return typeof x === "string";
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
