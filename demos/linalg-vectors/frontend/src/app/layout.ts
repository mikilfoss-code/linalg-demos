import { type GridLayout } from './state';
import {
  GRID_MAX_SAMPLES_FALLBACK,
  GRID_TILE_MAX_FALLBACK,
  GRID_TILE_MIN_FALLBACK,
} from './layout-config';

/**
 * Clamp a requested grid layout to valid positive dimensions and sample caps.
 *
 * @param layout - Requested grid columns/rows.
 * @param maxSamples - Maximum number of sample cells allowed.
 * @returns Normalized grid layout that fits within sample limits.
 */
export function clampGridLayout(layout: GridLayout, maxSamples: number): GridLayout {
  let columns = Math.max(1, Math.floor(layout.columns));
  let rows = Math.max(1, Math.floor(layout.rows));
  if (columns * rows > maxSamples) {
    // Prefer trimming rows to preserve column count.
    if (columns > maxSamples) {
      columns = maxSamples;
      rows = 1;
    } else {
      rows = Math.max(1, Math.floor(maxSamples / columns));
    }
  }
  return { columns, rows };
}

/**
 * Estimate how many columns fit in available width for a target tile size.
 *
 * @param width - Available grid width in CSS pixels.
 * @param tileSize - Desired tile size in CSS pixels.
 * @param columnGap - Gap between columns in CSS pixels.
 * @returns Column count floor-clamped to at least `1`.
 */
function computeColumnCount(width: number, tileSize: number, columnGap: number): number {
  if (tileSize <= 0 || width <= 0) return 1;
  return Math.max(1, Math.floor((width + columnGap) / (tileSize + columnGap)));
}

/**
 * Estimate minimum column count required to keep tiles at or below a max size.
 *
 * @param width - Available grid width in CSS pixels.
 * @param tileSize - Maximum tile size in CSS pixels.
 * @param columnGap - Gap between columns in CSS pixels.
 * @returns Column count ceil-clamped to at least `1`.
 */
function computeColumnCountForMax(width: number, tileSize: number, columnGap: number): number {
  if (tileSize <= 0 || width <= 0) return 1;
  return Math.max(1, Math.ceil((width + columnGap) / (tileSize + columnGap)));
}

/**
 * Compute row size from total width, columns, and inter-column gaps.
 *
 * @param width - Available grid width in CSS pixels.
 * @param columns - Number of grid columns.
 * @param columnGap - Gap between columns in CSS pixels.
 * @returns Row size in CSS pixels.
 */
export function computeRowSize(width: number, columns: number, columnGap: number): number {
  if (columns <= 0 || width <= 0) return 1;
  const totalGaps = columnGap * (columns - 1);
  const available = Math.max(0, width - totalGaps);
  return Math.max(1, available / columns);
}

/**
 * Compute how many rows fit in the available height.
 *
 * @param height - Available grid height in CSS pixels.
 * @param rowSize - Height of each row in CSS pixels.
 * @param rowGap - Gap between rows in CSS pixels.
 * @returns Row count floor-clamped to at least `1`.
 */
export function computeRowCount(height: number, rowSize: number, rowGap: number): number {
  if (rowSize <= 0 || height <= 0) return 1;
  return Math.max(1, Math.floor((height + rowGap) / (rowSize + rowGap)));
}

/**
 * Compute responsive grid layout and row size from viewport and dataset geometry.
 *
 * @param params - Layout inputs including available size, gaps, image ratio, and caps.
 * @returns Object with clamped `layout` and computed `rowSize`.
 */
export function computeGridLayout(params: {
  width: number;
  height: number;
  columnGap: number;
  rowGap: number;
  imageWidth: number;
  imageHeight: number;
  tileMin?: number;
  tileMax?: number;
  maxSamples?: number;
}): { layout: GridLayout; rowSize: number } {
  const {
    width,
    height,
    columnGap,
    rowGap,
    imageWidth,
    imageHeight,
    tileMin = GRID_TILE_MIN_FALLBACK,
    tileMax = GRID_TILE_MAX_FALLBACK,
    maxSamples = GRID_MAX_SAMPLES_FALLBACK,
  } = params;
  const maxColumnsForMin = computeColumnCount(width, tileMin, columnGap);
  const minColumnsForMax = computeColumnCountForMax(width, tileMax, columnGap);

  // Start from width-driven tile size, then enforce strict max cap.
  let columns = Math.max(1, maxColumnsForMin);
  if (minColumnsForMax > columns) {
    columns = minColumnsForMax;
  }

  const ratio = imageHeight > 0 ? imageHeight / Math.max(imageWidth, 1) : 1;
  const aspectFloor = Math.max(1, ratio);
  let rowSize = computeRowSize(width, columns, columnGap);
  rowSize = Math.max(rowSize, rowSize * aspectFloor);
  let rows = computeRowCount(height, rowSize, rowGap);
  let layout = clampGridLayout({ columns, rows }, maxSamples);

  if (layout.columns !== columns) {
    rowSize = computeRowSize(width, layout.columns, columnGap);
    rowSize = Math.max(rowSize, rowSize * aspectFloor);
    rows = computeRowCount(height, rowSize, rowGap);
    layout = clampGridLayout({ columns: layout.columns, rows }, maxSamples);
  }

  return { layout, rowSize };
}
