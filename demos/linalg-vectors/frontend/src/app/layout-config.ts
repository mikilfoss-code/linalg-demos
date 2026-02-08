import { type GridLayout } from './state';

export const GRID_TILE_MIN_FALLBACK = 100;
export const GRID_TILE_MAX_FALLBACK = 180;
export const TEXT_TILE_HEIGHT_FALLBACK = 96;
export const GRID_MAX_SAMPLES_FALLBACK = 64;
export const GRID_HEIGHT_VH_FALLBACK = 55;
export const GRID_FALLBACK_COLUMNS = 2;
export const GRID_FALLBACK_ROWS = 5;

/**
 * Parse a CSS pixel value string into a number.
 *
 * @param value - Raw CSS numeric string (e.g. `"12px"`).
 * @returns Parsed finite number, or `0` when parsing fails.
 */
export function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Read a CSS custom property as a floating-point number.
 *
 * @param name - CSS custom property name (e.g. `"--grid-gap"`).
 * @param fallback - Value returned when token is missing or invalid.
 * @returns Parsed numeric token value.
 */
export function getCssNumber(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Read a CSS custom property as a positive integer.
 *
 * @param name - CSS custom property name.
 * @param fallback - Value returned when token is missing or invalid.
 * @returns Parsed integer clamped to at least `1`.
 */
export function getCssInt(name: string, fallback: number): number {
  return Math.max(1, Math.floor(getCssNumber(name, fallback)));
}

/**
 * Resolve minimum grid tile size from CSS tokens.
 *
 * @returns Minimum tile size in CSS pixels.
 */
export function getGridTileMin(): number {
  return getCssNumber('--grid-tile-min', GRID_TILE_MIN_FALLBACK);
}

/**
 * Resolve maximum grid tile size from CSS tokens.
 *
 * @param min - Minimum allowed tile size.
 * @returns Maximum tile size in CSS pixels, never below `min`.
 */
export function getGridTileMax(min: number): number {
  return Math.max(getCssNumber('--grid-tile-max', GRID_TILE_MAX_FALLBACK), min);
}

/**
 * Resolve text tile row height from CSS tokens.
 *
 * @returns Minimum text tile height in CSS pixels.
 */
export function getTextTileHeight(): number {
  return getCssNumber('--text-tile-min-height', TEXT_TILE_HEIGHT_FALLBACK);
}

/**
 * Resolve maximum sample count from CSS tokens.
 *
 * @returns Positive integer sample cap.
 */
export function getGridMaxSamples(): number {
  return getCssInt('--grid-max-samples', GRID_MAX_SAMPLES_FALLBACK);
}

/**
 * Resolve grid height target as a viewport percentage.
 *
 * @returns Target grid height percentage (e.g. `55` for 55vh).
 */
export function getGridHeightVh(): number {
  return getCssNumber('--grid-height-vh', GRID_HEIGHT_VH_FALLBACK);
}

/**
 * Resolve fallback grid columns and rows from CSS tokens.
 *
 * @returns Initial grid layout used before runtime measurement.
 */
export function getFallbackGridLayout(): GridLayout {
  return {
    columns: getCssInt('--grid-fallback-columns', GRID_FALLBACK_COLUMNS),
    rows: getCssInt('--grid-fallback-rows', GRID_FALLBACK_ROWS),
  };
}

/**
 * Read computed grid gap values from the grid element.
 *
 * @param gridEl - Grid element used for sample tiles.
 * @returns Column and row gaps in CSS pixels.
 */
export function getGridGaps(gridEl: HTMLElement): { columnGap: number; rowGap: number } {
  const styles = getComputedStyle(gridEl);
  return {
    columnGap: parsePixelValue(styles.columnGap || styles.gap || '0'),
    rowGap: parsePixelValue(styles.rowGap || styles.gap || '0'),
  };
}

/**
 * Compute target grid height in CSS pixels from viewport height tokens.
 *
 * @returns Desired pixel height for grid layout calculations.
 */
export function getGridTargetHeight(): number {
  return window.innerHeight * (getGridHeightVh() / 100);
}
