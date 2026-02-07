import { type GridLayout } from './state';

export const GRID_TILE_MIN_FALLBACK = 100;
export const GRID_TILE_MAX_FALLBACK = 180;
export const TEXT_TILE_HEIGHT_FALLBACK = 96;
export const GRID_MAX_SAMPLES_FALLBACK = 64;
export const GRID_HEIGHT_VH_FALLBACK = 55;
export const GRID_FALLBACK_COLUMNS = 2;
export const GRID_FALLBACK_ROWS = 5;

export function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getCssNumber(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getCssInt(name: string, fallback: number): number {
  return Math.max(1, Math.floor(getCssNumber(name, fallback)));
}

export function getGridTileMin(): number {
  return getCssNumber('--grid-tile-min', GRID_TILE_MIN_FALLBACK);
}

export function getGridTileMax(min: number): number {
  return Math.max(getCssNumber('--grid-tile-max', GRID_TILE_MAX_FALLBACK), min);
}

export function getTextTileHeight(): number {
  return getCssNumber('--text-tile-min-height', TEXT_TILE_HEIGHT_FALLBACK);
}

export function getGridMaxSamples(): number {
  return getCssInt('--grid-max-samples', GRID_MAX_SAMPLES_FALLBACK);
}

export function getGridHeightVh(): number {
  return getCssNumber('--grid-height-vh', GRID_HEIGHT_VH_FALLBACK);
}

export function getFallbackGridLayout(): GridLayout {
  return {
    columns: getCssInt('--grid-fallback-columns', GRID_FALLBACK_COLUMNS),
    rows: getCssInt('--grid-fallback-rows', GRID_FALLBACK_ROWS),
  };
}

export function getGridGaps(gridEl: HTMLElement): { columnGap: number; rowGap: number } {
  const styles = getComputedStyle(gridEl);
  return {
    columnGap: parsePixelValue(styles.columnGap || styles.gap || '0'),
    rowGap: parsePixelValue(styles.rowGap || styles.gap || '0'),
  };
}

export function getGridTargetHeight(): number {
  return window.innerHeight * (getGridHeightVh() / 100);
}
