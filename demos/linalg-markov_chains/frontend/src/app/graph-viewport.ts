export type GraphViewportTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

const MIN_VIEWPORT_SCALE = 0.25;
const MAX_VIEWPORT_SCALE = 8;

/**
 * Identity transform used for the graph viewport layer.
 */
export function createDefaultGraphViewportTransform(): GraphViewportTransform {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
  };
}

/**
 * Clamp and normalize viewport transforms so external integrations can safely update zoom/pan.
 */
export function normalizeGraphViewportTransform(
  transform: Partial<GraphViewportTransform>,
  fallback: GraphViewportTransform
): GraphViewportTransform {
  const scale = clamp(
    typeof transform.scale === 'number' && Number.isFinite(transform.scale)
      ? transform.scale
      : fallback.scale,
    MIN_VIEWPORT_SCALE,
    MAX_VIEWPORT_SCALE
  );

  const translateX =
    typeof transform.translateX === 'number' && Number.isFinite(transform.translateX)
      ? transform.translateX
      : fallback.translateX;
  const translateY =
    typeof transform.translateY === 'number' && Number.isFinite(transform.translateY)
      ? transform.translateY
      : fallback.translateY;

  return {
    scale,
    translateX,
    translateY,
  };
}

/**
 * Convert viewport transform into SVG transform syntax.
 */
export function toSvgViewportTransform(transform: GraphViewportTransform): string {
  return `translate(${transform.translateX.toFixed(2)} ${transform.translateY.toFixed(
    2
  )}) scale(${transform.scale.toFixed(4)})`;
}

function clamp(value: number, min: number, max: number): number {
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}
