const EDGE_STROKE_WIDTH_BASE = 1.2;
const EDGE_STROKE_WIDTH_RANGE = 7.6;
const EDGE_OPACITY_BASE = 0.14;
const EDGE_OPACITY_RANGE = 0.86;

export const EDGE_DEFAULT_STROKE =
  'var(--graph-edge-stroke-default, hsl(208 72% 34%))';
export const EDGE_HIGHLIGHT_STROKE =
  'var(--graph-edge-stroke-highlight, hsl(2 72% 46%))';
export const EDGE_DEFAULT_MARKER_FILL =
  'var(--graph-edge-marker-fill, #0f4c81)';

export const NODE_DEFAULT_STROKE =
  'var(--graph-node-stroke-default, rgba(9, 39, 63, 0.45))';
export const NODE_HIGHLIGHT_STROKE =
  'var(--graph-node-stroke-highlight, hsl(2 72% 46%))';
export const NODE_DEFAULT_STROKE_WIDTH = 1.4;
export const NODE_HIGHLIGHT_STROKE_WIDTH = 3;
export const NODE_HIGHLIGHT_FILTER =
  'var(--graph-node-highlight-filter, drop-shadow(0 0 5px rgba(178, 35, 35, 0.35)))';

/**
 * Resolve edge stroke width from normalized weight.
 */
export function edgeStrokeWidth(weight: number): number {
  return EDGE_STROKE_WIDTH_BASE + clamp01(weight) * EDGE_STROKE_WIDTH_RANGE;
}

/**
 * Resolve edge opacity from normalized weight.
 */
export function edgeOpacity(weight: number): number {
  return EDGE_OPACITY_BASE + clamp01(weight) * EDGE_OPACITY_RANGE;
}

/**
 * Map a signed node value to non-highlight fill.
 */
export function colorForGraphNodeValue(value: number): string {
  const magnitude = clamp01(Math.abs(value));
  if (value < 0) {
    const hue = 28;
    const saturation = 82;
    const lightness = 95 - magnitude * 42;
    return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
  }
  const hue = 206;
  const saturation = 60;
  const lightness = 93 - magnitude * 46;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
}

/**
 * Map a signed node value to highlighted fill.
 */
export function colorForGraphHighlightedNodeValue(value: number): string {
  const magnitude = clamp01(Math.abs(value));
  if (value < 0) {
    const hue = 24;
    const saturation = 88;
    const lightness = 92 - magnitude * 44;
    return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
  }
  const hue = 206;
  const saturation = 74;
  const lightness = 90 - magnitude * 48;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
}

/**
 * Clamp a value to [0, 1].
 */
export function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
