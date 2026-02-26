import { buildQuadraticEdgePath, buildSelfLoopPath } from './geometry';
import { edgePathKey } from './highlight';
import {
  colorForGraphHighlightedNodeValue,
  colorForGraphNodeValue,
  EDGE_DEFAULT_MARKER_FILL,
  EDGE_DEFAULT_STROKE,
  EDGE_HIGHLIGHT_STROKE,
  edgeOpacity,
  edgeStrokeWidth,
  NODE_DEFAULT_STROKE,
  NODE_DEFAULT_STROKE_WIDTH,
  NODE_HIGHLIGHT_FILTER,
  NODE_HIGHLIGHT_STROKE,
  NODE_HIGHLIGHT_STROKE_WIDTH,
} from './style';
import type { GraphHighlightPresentation, GraphRenderScene } from './types';

const EDGE_CURVE_OFFSET = 28;
const ARROW_HEAD_BASE_WIDTH = 16;
const ARROW_HEAD_BASE_HEIGHT = 12;
const ARROW_HEAD_BASE_REF_X = 5.1;
const ARROW_TIP_OVERSHOOT = Math.max(0, ARROW_HEAD_BASE_WIDTH - ARROW_HEAD_BASE_REF_X);
const ARROW_HEAD_STROKE_BASELINE = 1.2;
const ARROW_HEAD_GROWTH_PER_STROKE = 0.08;
const ARROW_HEAD_MAX_SCALE = 1.6;
const ARROW_HEAD_SIZE_BUCKET_STEP = 0.25;
const EDGE_DEFAULT_MARKER_ID_PREFIX = 'graph-arrow-head';
const EDGE_HIGHLIGHT_MARKER_ID_PREFIX = 'graph-arrow-head-highlight';

/**
 * Render a directed graph scene into an SVG root using shared style/highlight behavior.
 */
export function renderDirectedGraphSvg(options: {
  svg: SVGSVGElement;
  scene: GraphRenderScene;
  presentation: GraphHighlightPresentation;
}): void {
  options.svg.replaceChildren();
  options.svg.setAttribute('viewBox', `0 0 ${options.scene.width} ${options.scene.height}`);
  options.svg.setAttribute('role', 'img');
  options.svg.setAttribute('aria-label', options.scene.ariaLabel);

  const defs = createSvgElement<SVGDefsElement>('defs');
  const markerCache = new Map<string, string>();
  options.svg.appendChild(defs);

  const edgeLayer = createSvgElement<SVGGElement>('g');
  const nodeLayer = createSvgElement<SVGGElement>('g');
  options.svg.append(edgeLayer, nodeLayer);

  const edgeKeySet = new Set(
    options.scene.edges.map((edge) => edgePathKey(edge.fromIndex, edge.toIndex))
  );
  const nodeByIndex = new Map(options.scene.nodes.map((node) => [node.index, node]));

  options.scene.edges.forEach((edge) => {
    const fromNode = nodeByIndex.get(edge.fromIndex);
    const toNode = nodeByIndex.get(edge.toIndex);
    if (!fromNode || !toNode) {
      return;
    }

    const key = edgePathKey(edge.fromIndex, edge.toIndex);
    const isHighlighted = options.presentation.highlightedEdgeKeys.has(key);
    const hasReverse =
      edge.fromIndex !== edge.toIndex &&
      edgeKeySet.has(edgePathKey(edge.toIndex, edge.fromIndex));
    const curveOffset = hasReverse ? EDGE_CURVE_OFFSET * (edge.fromIndex < edge.toIndex ? 1 : -1) : 0;
    const strokeWidth = edgeStrokeWidth(edge.weight);
    const geometry =
      edge.fromIndex === edge.toIndex
        ? buildSelfLoopPath({
            center: {
              x: fromNode.x,
              y: fromNode.y,
            },
            nodeRadius: options.scene.nodeRadius,
            markerTipOvershoot: ARROW_TIP_OVERSHOOT,
          })
        : buildQuadraticEdgePath({
            fromPoint: {
              x: fromNode.x,
              y: fromNode.y,
            },
            toPoint: {
              x: toNode.x,
              y: toNode.y,
            },
            nodeRadius: options.scene.nodeRadius,
            curveOffset,
            markerTipOvershoot: ARROW_TIP_OVERSHOOT,
          });

    const path = createSvgElement<SVGPathElement>('path');
    path.classList.add('graph-edge');
    path.setAttribute('d', geometry.pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('data-graph-target-kind', 'edge');
    path.setAttribute('data-from-index', String(edge.fromIndex));
    path.setAttribute('data-to-index', String(edge.toIndex));

    const stroke = isHighlighted ? EDGE_HIGHLIGHT_STROKE : EDGE_DEFAULT_STROKE;
    const opacity = edgeOpacity(edge.weight);
    const defaultMarkerId = getOrCreateArrowMarkerId({
      markerDefs: defs,
      markerCache,
      variant: 'default',
      strokeWidth,
    });
    const highlightMarkerId = getOrCreateArrowMarkerId({
      markerDefs: defs,
      markerCache,
      variant: 'highlight',
      strokeWidth,
    });
    path.style.stroke = stroke;
    path.style.strokeWidth = strokeWidth.toFixed(3);
    path.style.opacity = opacity.toFixed(3);
    path.setAttribute('marker-end', `url(#${isHighlighted ? highlightMarkerId : defaultMarkerId})`);

    edgeLayer.appendChild(path);

    if (edge.label) {
      const label = createSvgElement<SVGTextElement>('text');
      label.classList.add('graph-edge-label', 'graph-edge-value');
      label.setAttribute('x', geometry.labelPoint.x.toFixed(2));
      label.setAttribute('y', geometry.labelPoint.y.toFixed(2));
      label.textContent = edge.label;
      edgeLayer.appendChild(label);
    }
  });

  options.scene.nodes.forEach((node) => {
    const isHighlighted = options.presentation.highlightedNodeIndices.has(node.index);
    const group = createSvgElement<SVGGElement>('g');
    group.classList.add('graph-node');
    group.setAttribute('data-graph-target-kind', 'node');
    group.setAttribute('data-node-index', String(node.index));

    const circle = createSvgElement<SVGCircleElement>('circle');
    circle.classList.add('graph-node-circle');
    circle.setAttribute('cx', node.x.toFixed(2));
    circle.setAttribute('cy', node.y.toFixed(2));
    circle.setAttribute('r', String(options.scene.nodeRadius));
    if (node.value !== undefined) {
      circle.setAttribute(
        'fill',
        isHighlighted ? colorForGraphHighlightedNodeValue(node.value) : colorForGraphNodeValue(node.value)
      );
    }
    circle.style.stroke = isHighlighted ? NODE_HIGHLIGHT_STROKE : NODE_DEFAULT_STROKE;
    circle.style.strokeWidth = String(
      isHighlighted ? NODE_HIGHLIGHT_STROKE_WIDTH : NODE_DEFAULT_STROKE_WIDTH
    );
    circle.style.filter = isHighlighted ? NODE_HIGHLIGHT_FILTER : 'none';

    const label = createSvgElement<SVGTextElement>('text');
    label.classList.add('graph-node-label');
    label.setAttribute('x', node.x.toFixed(2));
    label.setAttribute('y', (node.y + 4).toFixed(2));
    label.textContent = node.label;

    group.append(circle, label);

    if (node.annotation) {
      const annotation = createSvgElement<SVGTextElement>('text');
      annotation.classList.add('graph-node-value');
      annotation.setAttribute('x', node.x.toFixed(2));
      annotation.setAttribute('y', (node.y + options.scene.nodeRadius + 16).toFixed(2));
      annotation.textContent = node.annotation;
      group.appendChild(annotation);
    }

    nodeLayer.appendChild(group);
  });
}

function getOrCreateArrowMarkerId(options: {
  markerDefs: SVGDefsElement;
  markerCache: Map<string, string>;
  variant: 'default' | 'highlight';
  strokeWidth: number;
}): string {
  const quantizedStrokeWidth = quantizeArrowStrokeWidth(options.strokeWidth);
  const cacheKey = `${options.variant}:${quantizedStrokeWidth.toFixed(2)}`;
  const cachedMarkerId = options.markerCache.get(cacheKey);
  if (cachedMarkerId) {
    return cachedMarkerId;
  }

  const size = resolveArrowHeadSize(quantizedStrokeWidth);
  const markerIdPrefix =
    options.variant === 'highlight'
      ? EDGE_HIGHLIGHT_MARKER_ID_PREFIX
      : EDGE_DEFAULT_MARKER_ID_PREFIX;
  const markerId = `${markerIdPrefix}-${Math.round(quantizedStrokeWidth * 100)}`;
  const marker = createSvgElement<SVGMarkerElement>('marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', size.width.toFixed(3));
  marker.setAttribute('markerHeight', size.height.toFixed(3));
  marker.setAttribute('refX', size.refX.toFixed(3));
  marker.setAttribute('refY', size.refY.toFixed(3));
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'userSpaceOnUse');

  const path = createSvgElement<SVGPathElement>('path');
  path.setAttribute(
    'd',
    `M 0 0 L ${size.width.toFixed(3)} ${size.refY.toFixed(3)} L 0 ${size.height.toFixed(3)} z`
  );
  path.setAttribute(
    'fill',
    options.variant === 'highlight' ? EDGE_HIGHLIGHT_STROKE : EDGE_DEFAULT_MARKER_FILL
  );
  marker.appendChild(path);

  options.markerDefs.appendChild(marker);
  options.markerCache.set(cacheKey, markerId);
  return markerId;
}

function quantizeArrowStrokeWidth(strokeWidth: number): number {
  const safeStrokeWidth = Math.max(0, strokeWidth);
  const bucketed =
    Math.round(safeStrokeWidth / ARROW_HEAD_SIZE_BUCKET_STEP) * ARROW_HEAD_SIZE_BUCKET_STEP;
  return Math.max(ARROW_HEAD_STROKE_BASELINE, bucketed);
}

function resolveArrowHeadSize(strokeWidth: number): {
  width: number;
  height: number;
  refX: number;
  refY: number;
} {
  const scale = clamp(
    1 + (strokeWidth - ARROW_HEAD_STROKE_BASELINE) * ARROW_HEAD_GROWTH_PER_STROKE,
    1,
    ARROW_HEAD_MAX_SCALE
  );
  const width = ARROW_HEAD_BASE_WIDTH * scale;
  const height = ARROW_HEAD_BASE_HEIGHT * scale;
  const refX = Math.max(0.1, width - ARROW_TIP_OVERSHOOT);
  const refY = height / 2;
  return {
    width,
    height,
    refX,
    refY,
  };
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  if (value <= min) {
    return min;
  }
  if (value >= max) {
    return max;
  }
  return value;
}

function createSvgElement<T extends SVGElement>(tagName: string): T {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName) as T;
}
