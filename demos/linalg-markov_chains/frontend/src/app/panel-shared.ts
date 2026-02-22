import { colorForStateValue } from '../lib/markov';
import type { GraphInteractionTarget } from './graph-interaction-presenter';
import type { PanelRenderContext } from './panel-context';

/**
 * Clamp numeric values into [0, 1] for color interpolation.
 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Convert base HSL color strings to HSL with alpha while preserving hue/sat/lightness.
 */
function withAlphaChannel(hslColor: string, alpha: number): string {
  const match = /^hsl\(([^)]+)\)$/.exec(hslColor.trim());
  if (!match) {
    return hslColor;
  }
  const base = match[1];
  return `hsl(${base} / ${alpha.toFixed(3)})`;
}

/**
 * Compute blue highlight shades aligned with graph node-color mapping.
 */
export function colorForPanelBlue(value: number, alpha: number): string {
  return withAlphaChannel(colorForStateValue(value), alpha);
}

/**
 * Compute red highlight shades aligned with graph highlighted-node mapping.
 */
export function colorForPanelRed(value: number, alpha: number): string {
  const normalized = clamp01(value);
  const hue = 3;
  const saturation = 84;
  const lightness = 93 - normalized * 52;
  return `hsl(${hue} ${saturation}% ${lightness.toFixed(1)}% / ${alpha.toFixed(3)})`;
}

/**
 * Normalize and sort node indices.
 */
export function dedupeAndSortNodeIndices(indices: readonly number[]): number[] {
  const unique = new Set<number>();
  indices.forEach((index) => {
    if (Number.isInteger(index) && index >= 0) {
      unique.add(index);
    }
  });
  return [...unique].sort((left, right) => left - right);
}

/**
 * Resolve panel node scope based on current full-extracted vs visible-only mode.
 */
export function resolveScopedNodeIndices(context: PanelRenderContext): number[] {
  const extracted = dedupeAndSortNodeIndices(context.extractedNodeIndices);
  if (context.scopeMode === 'full-extracted') {
    return extracted;
  }

  const visibleSet = new Set(context.viewportVisibleNodeIndices);
  return extracted.filter((nodeIndex) => visibleSet.has(nodeIndex));
}

/**
 * Keep window start indices within slider bounds.
 */
export function clampWindowStart(start: number, maxStart: number): number {
  if (!Number.isFinite(start)) return 0;
  if (start <= 0) return 0;
  if (start >= maxStart) return maxStart;
  return Math.floor(start);
}

/**
 * Move a matrix/state window so a target index remains in range.
 */
export function alignWindowStartToIncludeIndex(
  windowStart: number,
  targetIndex: number,
  scopedSize: number,
  windowSize: number
): number {
  const boundedWindowSize = Math.max(1, Math.min(windowSize, scopedSize));
  const maxStart = Math.max(0, scopedSize - boundedWindowSize);
  let next = clampWindowStart(windowStart, maxStart);
  if (targetIndex < next) {
    next = targetIndex;
  } else if (targetIndex >= next + boundedWindowSize) {
    next = targetIndex - boundedWindowSize + 1;
  }
  return clampWindowStart(next, maxStart);
}

/**
 * Build a short window-range label for slider controls.
 */
export function formatWindowRange(start: number, windowSize: number, total: number): string {
  if (total <= 0) {
    return '0-0 / 0';
  }
  const first = start + 1;
  const last = Math.min(total, start + windowSize);
  return `${first}-${last} / ${total}`;
}

/**
 * Create deterministic semantic key for a graph interaction target.
 */
export function graphTargetKey(target: GraphInteractionTarget | null): string | null {
  if (!target) {
    return null;
  }
  if (target.kind === 'node') {
    return `node:${target.nodeIndex}`;
  }
  if (target.kind === 'incoming-node') {
    return `incoming-node:${target.nodeIndex}`;
  }
  return `edge:${target.fromIndex}->${target.toIndex}`;
}

/**
 * Build an inline style attribute string for optional cell highlights.
 */
export function toStyleAttribute(color: string | null): string {
  return color ? `style="background-color: ${color};"` : '';
}
