import type { AppState } from './types';
import {
  DEFAULT_GRAPH_SUBGRAPH_SELECTION,
  buildGraphRenderData,
  type GraphRenderData,
  type GraphSubgraphSelection,
} from './graph-data';
import {
  DEFAULT_GRAPH_LAYOUT_STRATEGY_ID,
  createGraphLayoutEngine,
  probabilityToEdgeLength,
  type GraphNodeLayout,
} from './graph-layout';
import {
  createDefaultGraphViewportTransform,
  normalizeGraphViewportTransform,
  toSvgViewportTransform,
  type GraphViewportTransform,
} from './graph-viewport';
import {
  buildGraphInteractionPresentation,
  createEmptyGraphInteractionState,
  isSameGraphInteractionTarget,
  sanitizeGraphInteractionState,
  type GraphInteractionTarget,
} from './graph-interaction-presenter';
import {
  colorForStateValue,
  edgePathKey,
  formatProbability,
  lerp,
  MAX_NODE_COUNT,
  MIN_NODE_COUNT,
  type FlowAnimationState,
} from '../lib/markov';

const GRAPH_WIDTH = 880;
const GRAPH_HEIGHT = 620;
const GRAPH_CENTER_Y = GRAPH_HEIGHT * 0.43;
const NODE_RADIUS = 26;
const PROBABILITY_EPSILON = 1e-6;
const MIN_EDGE_LENGTH = 112;
const MAX_EDGE_LENGTH = 316;
const EDGE_LABEL_TAIL_BIAS = 0.33;
const ARROW_HEAD_WIDTH = 16;
const ARROW_HEAD_HEIGHT = 12;
const ARROW_HEAD_REF_X = 5.1;
const ARROW_HEAD_REF_Y = ARROW_HEAD_HEIGHT / 2;
const ARROW_TIP_OVERSHOOT = Math.max(0, ARROW_HEAD_WIDTH - ARROW_HEAD_REF_X);
const LOOP_BASE_RADIUS = NODE_RADIUS * 1.2;
const LOOP_RADIUS_STEPS = [0, 2, 4, 6];
const LOOP_ANGLE_STEP = Math.PI / 10;
const LOOP_ANGLE_SWEEPS = 6;
const LOOP_SPREAD = 0.78;
const LOOP_START_ANCHOR_RADIUS = NODE_RADIUS;
const LOOP_END_ANCHOR_RADIUS = NODE_RADIUS + ARROW_TIP_OVERSHOOT;
const EDGE_CUBIC_START_HANDLE = 0.34;
const EDGE_CUBIC_END_HANDLE = 0.46;
const EDGE_REVERSE_BASE_OFFSET = 12;
const EDGE_SINGLE_BASE_OFFSET = 9;
const EDGE_CUBIC_MAX_OFFSET_SCALE = 0.68;
const EDGE_DEFAULT_MARKER_ID = 'markov-arrow-head';
const EDGE_HIGHLIGHT_MARKER_ID = 'markov-arrow-head-highlight';
const EDGE_HIGHLIGHT_STROKE = 'hsl(2 72% 46%)';
const NODE_HIGHLIGHT_STROKE = 'hsl(2 72% 46%)';
const NODE_DEFAULT_STROKE = 'rgba(9, 39, 63, 0.45)';
const NODE_DEFAULT_STROKE_WIDTH = 1.4;
const NODE_HIGHLIGHT_STROKE_WIDTH = 3;
const INLINE_EDGE_EDITOR_WIDTH = 122;
const INLINE_EDGE_EDITOR_HEIGHT = 34;
const INLINE_NODE_EDITOR_WIDTH = 122;
const INLINE_NODE_EDITOR_HEIGHT = 34;
const VALUE_LABEL_BASE_HEIGHT = 16;
const VALUE_LABEL_CELL_PADDING_X = 4;
const VALUE_LABEL_CELL_PADDING_Y = 2;
const EDGE_VALUE_CANDIDATE_OFFSETS: Point[] = [
  { x: 14, y: -12 },
  { x: 14, y: 12 },
  { x: -14, y: -12 },
  { x: -14, y: 12 },
  { x: 0, y: -18 },
  { x: 0, y: 18 },
];
const NODE_VALUE_CANDIDATE_OFFSETS: Point[] = [
  { x: 0, y: NODE_RADIUS + 18 },
  { x: NODE_RADIUS + 26, y: 4 },
  { x: -NODE_RADIUS - 26, y: 4 },
  { x: 0, y: -NODE_RADIUS - 16 },
];
const EDGE_EDITOR_CANDIDATE_OFFSETS: Point[] = [
  { x: 30, y: -24 },
  { x: 30, y: 8 },
  { x: -30, y: -24 },
  { x: -30, y: 8 },
  { x: 0, y: 24 },
];
const NODE_EDITOR_CANDIDATE_OFFSETS: Point[] = [
  { x: 0, y: NODE_RADIUS + 36 },
  { x: NODE_RADIUS + 38, y: 4 },
  { x: -NODE_RADIUS - 38, y: 4 },
  { x: 0, y: -NODE_RADIUS - 22 },
];

const GRAPH_LAYOUT_ENGINE = createGraphLayoutEngine({
  defaultStrategyId: DEFAULT_GRAPH_LAYOUT_STRATEGY_ID,
});

type Point = {
  x: number;
  y: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CircleObstacle = {
  x: number;
  y: number;
  radius: number;
};

type PathGeometry = {
  pathData: string;
  labelPoint: Point;
  samplePoints: Point[];
};

type CubicCurve = {
  start: Point;
  controlA: Point;
  controlB: Point;
  end: Point;
};

type RuntimeParticle = {
  path: SVGPathElement;
  length: number;
  element: SVGCircleElement;
  delayMs: number;
  durationMs: number;
  offsetAlong: number;
  offsetNormal: number;
};

type EdgeVisualStyle = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

export type GraphPanelController = {
  element: HTMLElement;
  render: (state: AppState) => void;
  setExternalHoverTarget: (target: GraphInteractionTarget | null) => void;
  setExternalFocusTarget: (target: GraphInteractionTarget | null) => void;
  setSubgraphSelection: (selection: Partial<GraphSubgraphSelection>) => void;
  setViewportTransform: (transform: Partial<GraphViewportTransform>) => void;
  resetViewportTransform: () => void;
  destroy: () => void;
};

/**
 * Create the graph panel and run edge-flow animation for each step transition.
 */
export function createGraphPanelController(options: {
  onFlowAnimationComplete: (animationId: number) => void;
  onSetNodeCount: (nodeCount: number) => void;
  onGenerateRandomDirectedGraph: () => void;
  onSetTransitionCell: (rowIndex: number, colIndex: number, value: number) => void;
  onSetCurrentCell: (index: number, value: number) => void;
}): GraphPanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-graph">
      <h2 class="base-panel-title">Transition Graph</h2>
      <p class="base-subtitle">Edge direction follows P<sub>ij</sub>. Self-transition probabilities draw loop arrows.</p>
      <div class="markov-graph-controls">
        <div class="markov-controls-block">
          <label class="markov-control-label" for="graph-node-count-range">Node count</label>
          <div class="markov-node-count-controls">
            <input
              id="graph-node-count-range"
              type="range"
              min="${MIN_NODE_COUNT}"
              max="${MAX_NODE_COUNT}"
              step="1"
            />
            <input
              id="graph-node-count-number"
              type="number"
              min="${MIN_NODE_COUNT}"
              max="${MAX_NODE_COUNT}"
              step="1"
            />
          </div>
        </div>
        <div class="markov-inline-actions">
          <button class="base-button base-button--secondary" type="button" data-action="randomize-directed-graph">
            Random Directed Graph
          </button>
          <button
            class="base-button base-button--secondary"
            type="button"
            data-action="toggle-all-values"
            aria-pressed="false"
            id="toggle-all-values-button"
          >
            Show all values
          </button>
        </div>
      </div>

      <svg
        class="markov-graph"
        id="markov-graph"
        viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}"
        role="img"
        aria-label="Directed Markov transition graph"
      >
        <defs>
          <marker
            id="${EDGE_DEFAULT_MARKER_ID}"
            markerWidth="${ARROW_HEAD_WIDTH}"
            markerHeight="${ARROW_HEAD_HEIGHT}"
            refX="${ARROW_HEAD_REF_X}"
            refY="${ARROW_HEAD_REF_Y}"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L ${ARROW_HEAD_WIDTH} ${ARROW_HEAD_REF_Y} L 0 ${ARROW_HEAD_HEIGHT} z" fill="#0f4c81" />
          </marker>
          <marker
            id="${EDGE_HIGHLIGHT_MARKER_ID}"
            markerWidth="${ARROW_HEAD_WIDTH}"
            markerHeight="${ARROW_HEAD_HEIGHT}"
            refX="${ARROW_HEAD_REF_X}"
            refY="${ARROW_HEAD_REF_Y}"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L ${ARROW_HEAD_WIDTH} ${ARROW_HEAD_REF_Y} L 0 ${ARROW_HEAD_HEIGHT} z" fill="${EDGE_HIGHLIGHT_STROKE}" />
          </marker>
        </defs>
        <g id="viewport-layer">
          <g id="edge-layer"></g>
          <g id="particle-layer"></g>
          <g id="node-layer"></g>
          <g id="annotation-layer"></g>
        </g>
      </svg>

      <div class="markov-legend">
        <span><strong>Edge width/opacity:</strong> transition probability</span>
        <span><strong>Node color:</strong> current state probability x<sub>t</sub></span>
      </div>
    </section>
  `);

  const graphSvg = requireElement<SVGSVGElement>(element, '#markov-graph');
  const viewportLayer = requireElement<SVGGElement>(element, '#viewport-layer');
  const edgeLayer = requireElement<SVGGElement>(element, '#edge-layer');
  const particleLayer = requireElement<SVGGElement>(element, '#particle-layer');
  const nodeLayer = requireElement<SVGGElement>(element, '#node-layer');
  const annotationLayer = requireElement<SVGGElement>(element, '#annotation-layer');
  const nodeCountRange = requireElement<HTMLInputElement>(element, '#graph-node-count-range');
  const nodeCountNumber = requireElement<HTMLInputElement>(element, '#graph-node-count-number');
  const toggleAllValuesButton = requireElement<HTMLButtonElement>(element, '#toggle-all-values-button');

  nodeCountRange.addEventListener('input', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.onSetNodeCount(value);
  });

  nodeCountNumber.addEventListener('change', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.onSetNodeCount(value);
  });

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === 'randomize-directed-graph') {
      options.onGenerateRandomDirectedGraph();
      return;
    }
    if (target.dataset.action === 'toggle-all-values') {
      showAllValues = !showAllValues;
      updateToggleAllValuesButton();
      applyInteractionPresentation();
    }
  });

  element.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const action = target.dataset.action;
    if (action === 'graph-set-edge-weight') {
      const fromIndex = Number.parseInt(target.dataset.fromIndex ?? '', 10);
      const toIndex = Number.parseInt(target.dataset.toIndex ?? '', 10);
      const value = Number.parseFloat(target.value);
      options.onSetTransitionCell(fromIndex, toIndex, value);
      return;
    }

    if (action === 'graph-set-node-value') {
      const nodeIndex = Number.parseInt(target.dataset.nodeIndex ?? '', 10);
      const value = Number.parseFloat(target.value);
      options.onSetCurrentCell(nodeIndex, value);
    }
  });

  graphSvg.addEventListener('pointermove', (event) => {
    const hoveredTarget = readGraphTarget(event.target);
    if (isSameGraphInteractionTarget(interactionState.hovered, hoveredTarget)) {
      return;
    }
    interactionState = {
      ...interactionState,
      hovered: hoveredTarget,
    };
    applyInteractionPresentation();
  });

  graphSvg.addEventListener('pointerleave', () => {
    if (!interactionState.hovered) return;
    interactionState = {
      ...interactionState,
      hovered: null,
    };
    applyInteractionPresentation();
  });

  graphSvg.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.action?.startsWith('graph-set-')) {
      return;
    }
    const clickedTarget = readGraphTarget(event.target);
    if (isSameGraphInteractionTarget(interactionState.selected, clickedTarget)) {
      return;
    }
    interactionState = {
      ...interactionState,
      selected: clickedTarget,
    };
    applyInteractionPresentation();
  });

  element.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.action?.startsWith('graph-set-')) return;
    if (event.key !== 'Enter') return;

    target.blur();
    if (interactionState.selected) {
      interactionState = {
        ...interactionState,
        selected: null,
      };
      applyInteractionPresentation();
    }
  });

  const handleWindowPointerDown = (event: PointerEvent) => {
    if (!interactionState.selected) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const isGraphInput =
      target instanceof HTMLInputElement && target.dataset.action?.startsWith('graph-set-');
    const graphTarget = readGraphTarget(target);
    const isInsideGraph = graphSvg.contains(target);
    if (isInsideGraph && (Boolean(graphTarget) || isGraphInput)) {
      return;
    }

    interactionState = {
      ...interactionState,
      selected: null,
    };
    applyInteractionPresentation();
  };
  window.addEventListener('pointerdown', handleWindowPointerDown, true);

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let lastCompletedAnimationId: number | null = null;
  let animationFrameHandle: number | null = null;

  let currentNodeCircles = new Map<number, SVGCircleElement>();
  let currentPathByKey = new Map<string, SVGPathElement>();
  let currentEdgeBaseStyles = new Map<string, EdgeVisualStyle>();
  let currentEdgeLabelPoints = new Map<string, Point>();
  let currentNodeCenters = new Map<number, Point>();
  let currentHighlightedNodeIndices = new Set<number>();
  let interactionState = createEmptyGraphInteractionState();
  let externalHoverTarget: GraphInteractionTarget | null = null;
  let externalFocusTarget: GraphInteractionTarget | null = null;
  let lastRenderedState: AppState | null = null;
  let lastGraphData: GraphRenderData | null = null;
  let showAllValues = false;
  let isAnimationRunning = false;
  let subgraphSelection: GraphSubgraphSelection = {
    ...DEFAULT_GRAPH_SUBGRAPH_SELECTION,
  };
  let viewportTransform = createDefaultGraphViewportTransform();
  viewportLayer.setAttribute('transform', toSvgViewportTransform(viewportTransform));
  updateToggleAllValuesButton();

  const controller: GraphPanelController = {
    element,
    render(state) {
      lastRenderedState = state;
      lastGraphData = buildGraphRenderData(state, subgraphSelection);
      viewportLayer.setAttribute('transform', toSvgViewportTransform(viewportTransform));
      nodeCountRange.value = String(state.nodeCount);
      nodeCountNumber.value = String(state.nodeCount);
      updateToggleAllValuesButton();
      interactionState = sanitizeGraphInteractionState(interactionState, state);
      externalHoverTarget = sanitizeExternalTarget(externalHoverTarget, state);
      externalFocusTarget = sanitizeExternalTarget(externalFocusTarget, state);

      drawGraph({
        state,
        graphData: lastGraphData,
        graphSvg,
        edgeLayer,
        annotationLayer,
        nodeLayer,
        currentNodeCircles,
        currentPathByKey,
        currentEdgeBaseStyles,
        currentEdgeLabelPoints,
        currentNodeCenters,
      });
      applyInteractionPresentation();

      if (!state.flowAnimation) {
        cancelAnimationLoop();
        particleLayer.replaceChildren();
        return;
      }

      if (reduceMotionQuery.matches) {
        if (state.flowAnimation.id !== lastCompletedAnimationId) {
          lastCompletedAnimationId = state.flowAnimation.id;
          options.onFlowAnimationComplete(state.flowAnimation.id);
        }
        return;
      }

      startFlowAnimation({
        animation: state.flowAnimation,
        nodeCircles: currentNodeCircles,
        pathByKey: currentPathByKey,
        particleLayer,
        onComplete: (animationId) => {
          lastCompletedAnimationId = animationId;
          options.onFlowAnimationComplete(animationId);
        },
        cancelAnimationLoop,
      });
    },
    setExternalHoverTarget(target) {
      if (isSameGraphInteractionTarget(externalHoverTarget, target)) {
        return;
      }
      externalHoverTarget = target;
      applyInteractionPresentation();
    },
    setExternalFocusTarget(target) {
      if (isSameGraphInteractionTarget(externalFocusTarget, target)) {
        return;
      }
      externalFocusTarget = target;
      applyInteractionPresentation();
    },
    setSubgraphSelection(selection) {
      const normalizedSelection = normalizeSubgraphSelection(selection, subgraphSelection);
      if (isSameSubgraphSelection(subgraphSelection, normalizedSelection)) {
        return;
      }
      subgraphSelection = normalizedSelection;
      if (lastRenderedState) {
        controller.render(lastRenderedState);
      }
    },
    setViewportTransform(transform) {
      viewportTransform = normalizeGraphViewportTransform(transform, viewportTransform);
      viewportLayer.setAttribute('transform', toSvgViewportTransform(viewportTransform));
    },
    resetViewportTransform() {
      viewportTransform = createDefaultGraphViewportTransform();
      viewportLayer.setAttribute('transform', toSvgViewportTransform(viewportTransform));
    },
    destroy() {
      cancelAnimationLoop();
      window.removeEventListener('pointerdown', handleWindowPointerDown, true);
    },
  };
  return controller;

  function applyInteractionPresentation() {
    const renderState = lastRenderedState;
    if (!renderState) return;

    interactionState = sanitizeGraphInteractionState(interactionState, renderState);
    externalHoverTarget = sanitizeExternalTarget(externalHoverTarget, renderState);
    externalFocusTarget = sanitizeExternalTarget(externalFocusTarget, renderState);
    const presentation = buildGraphInteractionPresentation(renderState, {
      hovered: externalHoverTarget ?? externalFocusTarget ?? interactionState.hovered,
      selected: interactionState.selected,
    });
    currentHighlightedNodeIndices = new Set(presentation.highlightedNodeIndices);

    currentPathByKey.forEach((path, key) => {
      const baseStyle = currentEdgeBaseStyles.get(key);
      if (!baseStyle) return;

      if (presentation.highlightedEdgeKeys.has(key)) {
        path.style.stroke = EDGE_HIGHLIGHT_STROKE;
        path.style.opacity = baseStyle.opacity.toFixed(3);
        path.style.strokeWidth = baseStyle.strokeWidth.toFixed(3);
        path.setAttribute('marker-end', markerUrl(EDGE_HIGHLIGHT_MARKER_ID));
        return;
      }

      path.style.stroke = baseStyle.stroke;
      path.style.opacity = baseStyle.opacity.toFixed(3);
      path.style.strokeWidth = baseStyle.strokeWidth.toFixed(3);
      path.setAttribute('marker-end', markerUrl(EDGE_DEFAULT_MARKER_ID));
    });

    currentNodeCircles.forEach((circle, index) => {
      if (presentation.highlightedNodeIndices.has(index)) {
        circle.style.stroke = NODE_HIGHLIGHT_STROKE;
        circle.style.strokeWidth = String(NODE_HIGHLIGHT_STROKE_WIDTH);
        circle.style.filter = 'drop-shadow(0 0 5px rgba(178, 35, 35, 0.35))';
        const value = renderState.currentVector[index] ?? 0;
        circle.setAttribute('fill', colorForHighlightedNodeValue(value));
        return;
      }
      circle.style.stroke = NODE_DEFAULT_STROKE;
      circle.style.strokeWidth = String(NODE_DEFAULT_STROKE_WIDTH);
      circle.style.filter = 'none';
      if (!isAnimationRunning) {
        const value = renderState.currentVector[index] ?? 0;
        circle.setAttribute('fill', colorForStateValue(value));
      }
    });

    renderInlineAnnotations({
      state: renderState,
      activeTarget: presentation.activeTarget,
      selectedTarget: presentation.selectedTarget,
      selectedEdgeEditor: presentation.selectedEdgeEditor,
      selectedNodeEditor: presentation.selectedNodeEditor,
    });
  }

  function renderInlineAnnotations(config: {
    state: AppState;
    activeTarget: GraphInteractionTarget | null;
    selectedTarget: GraphInteractionTarget | null;
    selectedEdgeEditor: { fromIndex: number; toIndex: number; value: number } | null;
    selectedNodeEditor: { nodeIndex: number; value: number } | null;
  }) {
    annotationLayer.replaceChildren();

    const edgeKeysToShow = new Set<string>();
    const nodesToShow = new Set<number>();
    const occupiedRects: Rect[] = [];
    const nodeObstacles: CircleObstacle[] = Array.from(currentNodeCenters.values()).map((center) => ({
      x: center.x,
      y: center.y,
      radius: NODE_RADIUS + 7,
    }));

    if (showAllValues) {
      currentNodeCenters.forEach((_center, nodeIndex) => {
        nodesToShow.add(nodeIndex);
      });
      currentEdgeLabelPoints.forEach((_point, key) => {
        edgeKeysToShow.add(key);
      });
    }

    if (config.activeTarget?.kind === 'edge') {
      edgeKeysToShow.add(edgePathKey(config.activeTarget.fromIndex, config.activeTarget.toIndex));
      nodesToShow.add(config.activeTarget.fromIndex);
      nodesToShow.add(config.activeTarget.toIndex);
    } else if (config.activeTarget?.kind === 'node') {
      const activeNodeIndex = config.activeTarget.nodeIndex;
      nodesToShow.add(activeNodeIndex);
      currentEdgeLabelPoints.forEach((_point, key) => {
        const parsed = parseEdgeKey(key);
        if (!parsed || parsed.fromIndex !== activeNodeIndex) return;
        const value = config.state.transitionMatrix[parsed.fromIndex]?.[parsed.toIndex] ?? 0;
        if (value > PROBABILITY_EPSILON) {
          edgeKeysToShow.add(key);
        }
      });
    }

    if (config.selectedTarget?.kind === 'edge') {
      edgeKeysToShow.add(edgePathKey(config.selectedTarget.fromIndex, config.selectedTarget.toIndex));
      nodesToShow.add(config.selectedTarget.fromIndex);
      nodesToShow.add(config.selectedTarget.toIndex);
    } else if (config.selectedTarget?.kind === 'node') {
      nodesToShow.add(config.selectedTarget.nodeIndex);
    }

    edgeKeysToShow.forEach((key) => {
      const indices = parseEdgeKey(key);
      if (!indices) return;
      const point = currentEdgeLabelPoints.get(key);
      if (!point) return;
      const probability = config.state.transitionMatrix[indices.fromIndex]?.[indices.toIndex] ?? 0;
      const text = formatProbability(probability, 3);
      const labelWidth =
        estimateLabelWidth(text, 'edge') + VALUE_LABEL_CELL_PADDING_X * 2;
      const labelHeight = VALUE_LABEL_BASE_HEIGHT + VALUE_LABEL_CELL_PADDING_Y * 2;
      const rect = placeRectNearAnchor({
        anchor: point,
        width: labelWidth,
        height: labelHeight,
        candidateOffsets: EDGE_VALUE_CANDIDATE_OFFSETS,
        occupiedRects,
        nodeObstacles,
      });
      const label = createValueLabel({
        rect,
        text,
        kind: 'edge',
      });
      occupiedRects.push(rect);
      annotationLayer.appendChild(label);
    });

    nodesToShow.forEach((nodeIndex) => {
      const center = currentNodeCenters.get(nodeIndex);
      if (!center) return;
      const value = config.state.currentVector[nodeIndex] ?? 0;
      const valueText = formatProbability(value, 3);
      const text = `N${nodeIndex + 1}=${valueText}`;
      const labelWidth =
        estimateLabelWidth(text, 'node') + VALUE_LABEL_CELL_PADDING_X * 2;
      const labelHeight = VALUE_LABEL_BASE_HEIGHT + VALUE_LABEL_CELL_PADDING_Y * 2;
      const rect = placeRectNearAnchor({
        anchor: center,
        width: labelWidth,
        height: labelHeight,
        candidateOffsets: NODE_VALUE_CANDIDATE_OFFSETS,
        occupiedRects,
        nodeObstacles,
      });
      const label = createValueLabel({
        rect,
        text: valueText,
        kind: 'node',
        nodeIndex,
      });
      occupiedRects.push(rect);
      annotationLayer.appendChild(label);
    });

    if (config.selectedEdgeEditor) {
      const key = edgePathKey(config.selectedEdgeEditor.fromIndex, config.selectedEdgeEditor.toIndex);
      const point = currentEdgeLabelPoints.get(key);
      if (point) {
        const rect = placeRectNearAnchor({
          anchor: point,
          width: INLINE_EDGE_EDITOR_WIDTH,
          height: INLINE_EDGE_EDITOR_HEIGHT,
          candidateOffsets: EDGE_EDITOR_CANDIDATE_OFFSETS,
          occupiedRects,
          nodeObstacles,
        });
        annotationLayer.appendChild(
          createInlineEditor({
            x: rect.x,
            y: rect.y,
            width: INLINE_EDGE_EDITOR_WIDTH,
            height: INLINE_EDGE_EDITOR_HEIGHT,
            inputMarkup: `
              <input
                class="markov-number-input markov-number-input--graph-inline"
                type="number"
                min="0"
                max="1"
                step="0.01"
                data-action="graph-set-edge-weight"
                data-from-index="${config.selectedEdgeEditor.fromIndex}"
                data-to-index="${config.selectedEdgeEditor.toIndex}"
                value="${config.selectedEdgeEditor.value.toFixed(4)}"
              />
            `,
          })
        );
        occupiedRects.push(rect);
      }
    }

    if (config.selectedNodeEditor) {
      const center = currentNodeCenters.get(config.selectedNodeEditor.nodeIndex);
      if (center) {
        const rect = placeRectNearAnchor({
          anchor: center,
          width: INLINE_NODE_EDITOR_WIDTH,
          height: INLINE_NODE_EDITOR_HEIGHT,
          candidateOffsets: NODE_EDITOR_CANDIDATE_OFFSETS,
          occupiedRects,
          nodeObstacles,
        });
        annotationLayer.appendChild(
          createInlineEditor({
            x: rect.x,
            y: rect.y,
            width: INLINE_NODE_EDITOR_WIDTH,
            height: INLINE_NODE_EDITOR_HEIGHT,
            inputMarkup: `
              <input
                class="markov-number-input markov-number-input--graph-inline"
                type="number"
                min="0"
                max="1"
                step="0.01"
                data-action="graph-set-node-value"
                data-node-index="${config.selectedNodeEditor.nodeIndex}"
                value="${config.selectedNodeEditor.value.toFixed(4)}"
              />
            `,
          })
        );
        occupiedRects.push(rect);
      }
    }
  }

  function createValueLabel(config: {
    rect: Rect;
    text: string;
    kind: 'edge' | 'node';
    nodeIndex?: number;
  }): SVGGElement {
    const group = createSvgElement<SVGGElement>('g');
    const cell = createSvgElement<SVGRectElement>('rect');
    cell.classList.add('markov-graph-value-cell');
    cell.setAttribute('x', config.rect.x.toFixed(2));
    cell.setAttribute('y', config.rect.y.toFixed(2));
    cell.setAttribute('width', config.rect.width.toFixed(2));
    cell.setAttribute('height', config.rect.height.toFixed(2));
    cell.setAttribute('rx', '4');
    cell.setAttribute('ry', '4');

    const label = createSvgElement<SVGTextElement>('text');
    label.classList.add('markov-graph-value-label');
    label.classList.add(
      config.kind === 'edge' ? 'markov-graph-value-label--edge' : 'markov-graph-value-label--node'
    );
    label.setAttribute('x', (config.rect.x + config.rect.width / 2).toFixed(2));
    label.setAttribute('y', (config.rect.y + config.rect.height / 2).toFixed(2));
    const nodeIndex = config.nodeIndex;
    if (config.kind === 'node' && typeof nodeIndex === 'number' && Number.isInteger(nodeIndex)) {
      setSvgNodeLabelText(label, nodeIndex, `=${config.text}`);
    } else {
      label.textContent = config.text;
    }
    group.append(cell, label);
    return group;
  }

  function createInlineEditor(config: {
    x: number;
    y: number;
    width: number;
    height: number;
    inputMarkup: string;
  }): SVGForeignObjectElement {
    const foreignObject = createSvgElement<SVGForeignObjectElement>('foreignObject');
    foreignObject.setAttribute('x', config.x.toFixed(2));
    foreignObject.setAttribute('y', config.y.toFixed(2));
    foreignObject.setAttribute('width', config.width.toFixed(2));
    foreignObject.setAttribute('height', config.height.toFixed(2));
    foreignObject.classList.add('markov-graph-editor-foreign');

    const wrap = document.createElement('div');
    wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrap.className = 'markov-graph-editor-wrap';
    wrap.innerHTML = config.inputMarkup.trim();
    foreignObject.appendChild(wrap);

    return foreignObject;
  }

  function updateToggleAllValuesButton() {
    toggleAllValuesButton.textContent = showAllValues ? 'Hide all values' : 'Show all values';
    toggleAllValuesButton.setAttribute('aria-pressed', showAllValues ? 'true' : 'false');
  }

  function estimateLabelWidth(text: string, kind: 'edge' | 'node'): number {
    const base = kind === 'edge' ? 38 : 52;
    return Math.max(base, text.length * 6.8 + 10);
  }

  function placeRectNearAnchor(options: {
    anchor: Point;
    width: number;
    height: number;
    candidateOffsets: readonly Point[];
    occupiedRects: readonly Rect[];
    nodeObstacles: readonly CircleObstacle[];
  }): Rect {
    const candidates = [{ x: 0, y: 0 }, ...options.candidateOffsets];
    let best: Rect | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((offset) => {
      const candidate: Rect = {
        x: clamp(options.anchor.x + offset.x - options.width / 2, 2, GRAPH_WIDTH - options.width - 2),
        y: clamp(options.anchor.y + offset.y - options.height / 2, 2, GRAPH_HEIGHT - options.height - 2),
        width: options.width,
        height: options.height,
      };
      const score = scoreAnnotationRect(candidate, {
        occupiedRects: options.occupiedRects,
        nodeObstacles: options.nodeObstacles,
      }) + Math.hypot(offset.x, offset.y) * 0.08;

      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return best ?? {
      x: clamp(options.anchor.x - options.width / 2, 2, GRAPH_WIDTH - options.width - 2),
      y: clamp(options.anchor.y - options.height / 2, 2, GRAPH_HEIGHT - options.height - 2),
      width: options.width,
      height: options.height,
    };
  }

  function scoreAnnotationRect(
    rect: Rect,
    options: {
      occupiedRects: readonly Rect[];
      nodeObstacles: readonly CircleObstacle[];
    }
  ): number {
    let score = 0;
    options.occupiedRects.forEach((occupied) => {
      const overlap = rectIntersectionArea(rect, occupied);
      if (overlap > 0) {
        score += overlap * 12;
      }
    });

    options.nodeObstacles.forEach((node) => {
      const distance = distanceFromRectToPoint(rect, { x: node.x, y: node.y });
      const overlap = node.radius - distance;
      if (overlap > 0) {
        score += overlap * overlap * 11;
      }
    });

    return score;
  }

  function rectIntersectionArea(left: Rect, right: Rect): number {
    const overlapWidth =
      Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
    if (overlapWidth <= 0) return 0;

    const overlapHeight =
      Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
    if (overlapHeight <= 0) return 0;

    return overlapWidth * overlapHeight;
  }

  function distanceFromRectToPoint(rect: Rect, point: Point): number {
    const clampedX = clamp(point.x, rect.x, rect.x + rect.width);
    const clampedY = clamp(point.y, rect.y, rect.y + rect.height);
    return Math.hypot(point.x - clampedX, point.y - clampedY);
  }

  function sanitizeExternalTarget(
    target: GraphInteractionTarget | null,
    state: AppState
  ): GraphInteractionTarget | null {
    return sanitizeGraphInteractionState(
      {
        hovered: target,
        selected: null,
      },
      state
    ).hovered;
  }

  function cancelAnimationLoop() {
    if (animationFrameHandle !== null) {
      cancelAnimationFrame(animationFrameHandle);
      animationFrameHandle = null;
    }
    isAnimationRunning = false;
  }

  function computePathFrame(
    path: SVGPathElement,
    sampleLength: number,
    totalLength: number
  ): {
    point: Point;
    tangent: Point;
    normal: Point;
  } {
    const clampedLength = clamp(sampleLength, 0, totalLength);
    const point = path.getPointAtLength(clampedLength);
    const delta = Math.max(0.8, Math.min(6, totalLength * 0.02));
    const startLength = Math.max(0, clampedLength - delta);
    const endLength = Math.min(totalLength, clampedLength + delta);
    const startPoint = path.getPointAtLength(startLength);
    const endPoint = path.getPointAtLength(endLength);

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const magnitude = Math.hypot(dx, dy);
    const tangent =
      magnitude > PROBABILITY_EPSILON
        ? { x: dx / magnitude, y: dy / magnitude }
        : { x: 1, y: 0 };
    const normal = {
      x: -tangent.y,
      y: tangent.x,
    };

    return {
      point: {
        x: point.x,
        y: point.y,
      },
      tangent,
      normal,
    };
  }

  function startFlowAnimation(config: {
    animation: FlowAnimationState;
    nodeCircles: Map<number, SVGCircleElement>;
    pathByKey: Map<string, SVGPathElement>;
    particleLayer: SVGGElement;
    onComplete: (animationId: number) => void;
    cancelAnimationLoop: () => void;
  }) {
    config.cancelAnimationLoop();
    config.particleLayer.replaceChildren();
    isAnimationRunning = true;

    const runtimeParticles: RuntimeParticle[] = [];
    config.animation.particles.forEach((particle) => {
      const path = config.pathByKey.get(particle.pathKey);
      if (!path) {
        return;
      }

      const dot = createSvgElement<SVGCircleElement>('circle');
      dot.classList.add('markov-flow-dot');
      dot.setAttribute('r', particle.radius.toFixed(2));
      dot.setAttribute('visibility', 'hidden');
      config.particleLayer.appendChild(dot);

      runtimeParticles.push({
        path,
        length: path.getTotalLength(),
        element: dot,
        delayMs: particle.delayMs,
        durationMs: particle.durationMs,
        offsetAlong: particle.offsetAlong,
        offsetNormal: particle.offsetNormal,
      });
    });

    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const progress = clamp01(elapsed / config.animation.durationMs);
      const easedProgress = easeInOutCubic(progress);

      config.nodeCircles.forEach((circle, index) => {
        const from = config.animation.fromVector[index] ?? 0;
        const to = config.animation.toVector[index] ?? 0;
        const interpolated = lerp(from, to, easedProgress);
        if (currentHighlightedNodeIndices.has(index)) {
          circle.setAttribute('fill', colorForHighlightedNodeValue(interpolated));
        } else {
          circle.setAttribute('fill', colorForStateValue(interpolated));
        }
      });

      runtimeParticles.forEach((particle) => {
        const localProgress = (elapsed - particle.delayMs) / particle.durationMs;
        if (localProgress <= 0 || localProgress >= 1) {
          particle.element.setAttribute('visibility', 'hidden');
          return;
        }

        const pathProgress = clamp01(localProgress);
        const sampleLength = pathProgress * particle.length;
        const frame = computePathFrame(particle.path, sampleLength, particle.length);
        const offsetX =
          frame.tangent.x * particle.offsetAlong + frame.normal.x * particle.offsetNormal;
        const offsetY =
          frame.tangent.y * particle.offsetAlong + frame.normal.y * particle.offsetNormal;

        particle.element.setAttribute('visibility', 'visible');
        particle.element.setAttribute('cx', (frame.point.x + offsetX).toFixed(2));
        particle.element.setAttribute('cy', (frame.point.y + offsetY).toFixed(2));
        particle.element.style.opacity = '1';
      });

      if (elapsed < config.animation.durationMs) {
        animationFrameHandle = requestAnimationFrame(renderFrame);
        return;
      }

      config.cancelAnimationLoop();
      config.nodeCircles.forEach((circle, index) => {
        const to = config.animation.toVector[index] ?? 0;
        if (currentHighlightedNodeIndices.has(index)) {
          circle.setAttribute('fill', colorForHighlightedNodeValue(to));
        } else {
          circle.setAttribute('fill', colorForStateValue(to));
        }
      });
      config.particleLayer.replaceChildren();

      if (config.animation.id !== lastCompletedAnimationId) {
        config.onComplete(config.animation.id);
      }
    };

    animationFrameHandle = requestAnimationFrame(renderFrame);
  }
}

function drawGraph(args: {
  state: AppState;
  graphData: GraphRenderData;
  graphSvg: SVGSVGElement;
  edgeLayer: SVGGElement;
  annotationLayer: SVGGElement;
  nodeLayer: SVGGElement;
  currentNodeCircles: Map<number, SVGCircleElement>;
  currentPathByKey: Map<string, SVGPathElement>;
  currentEdgeBaseStyles: Map<string, EdgeVisualStyle>;
  currentEdgeLabelPoints: Map<string, Point>;
  currentNodeCenters: Map<number, Point>;
}) {
  args.edgeLayer.replaceChildren();
  args.annotationLayer.replaceChildren();
  args.nodeLayer.replaceChildren();
  args.currentNodeCircles.clear();
  args.currentPathByKey.clear();
  args.currentEdgeBaseStyles.clear();
  args.currentEdgeLabelPoints.clear();
  args.currentNodeCenters.clear();

  const nodeLayout = GRAPH_LAYOUT_ENGINE.computeLayout({
    nodeCount: args.graphData.nodeCount,
    transitionMatrix: args.graphData.transitionMatrix,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    nodeRadius: NODE_RADIUS,
    minEdgeLength: MIN_EDGE_LENGTH,
    maxEdgeLength: MAX_EDGE_LENGTH,
  });
  const edgeKeySet = new Set(args.graphData.edgeKeys);
  const flowMassByPath = new Map<string, number>();
  args.state.flowAnimation?.edges.forEach((edge) => {
    flowMassByPath.set(edge.pathKey, edge.mass);
  });

  const nonSelfGeometryByKey = new Map<string, PathGeometry>();
  const collisionPoints: Point[] = [];

  for (let fromLocalIndex = 0; fromLocalIndex < args.graphData.nodeCount; fromLocalIndex += 1) {
    for (let toLocalIndex = 0; toLocalIndex < args.graphData.nodeCount; toLocalIndex += 1) {
      const probability = args.graphData.transitionMatrix[fromLocalIndex]?.[toLocalIndex] ?? 0;
      const fromIndex = args.graphData.nodeIndices[fromLocalIndex] ?? fromLocalIndex;
      const toIndex = args.graphData.nodeIndices[toLocalIndex] ?? toLocalIndex;
      const key = edgePathKey(fromIndex, toIndex);
      if (probability <= PROBABILITY_EPSILON || fromLocalIndex === toLocalIndex) continue;
      if (!edgeKeySet.has(key)) continue;

      const geometry = createEdgePath(
        nodeLayout[fromLocalIndex],
        nodeLayout[toLocalIndex],
        probability,
        (args.graphData.transitionMatrix[toLocalIndex]?.[fromLocalIndex] ?? 0) > PROBABILITY_EPSILON,
        fromLocalIndex < toLocalIndex
      );
      nonSelfGeometryByKey.set(key, geometry);
      collisionPoints.push(...geometry.samplePoints);
    }
  }

  for (let fromLocalIndex = 0; fromLocalIndex < args.graphData.nodeCount; fromLocalIndex += 1) {
    for (let toLocalIndex = 0; toLocalIndex < args.graphData.nodeCount; toLocalIndex += 1) {
      const probability = args.graphData.transitionMatrix[fromLocalIndex]?.[toLocalIndex] ?? 0;
      if (probability <= PROBABILITY_EPSILON) continue;

      const fromIndex = args.graphData.nodeIndices[fromLocalIndex] ?? fromLocalIndex;
      const toIndex = args.graphData.nodeIndices[toLocalIndex] ?? toLocalIndex;
      const key = edgePathKey(fromIndex, toIndex);
      if (!edgeKeySet.has(key)) continue;
      const flowMass = flowMassByPath.get(key) ?? 0;
      const edgePath = createSvgElement<SVGPathElement>('path');
      const geometry =
        fromLocalIndex === toLocalIndex
          ? createSelfLoopPath({
              node: nodeLayout[fromLocalIndex],
              nodeIndex: fromIndex,
              allNodes: nodeLayout,
              existingEdgeSamples: collisionPoints,
            })
          : (nonSelfGeometryByKey.get(key) ??
            createEdgePath(
              nodeLayout[fromLocalIndex],
              nodeLayout[toLocalIndex],
              probability,
              (args.graphData.transitionMatrix[toLocalIndex]?.[fromLocalIndex] ?? 0) >
                PROBABILITY_EPSILON,
              fromLocalIndex < toLocalIndex
            ));

      if (fromLocalIndex === toLocalIndex) {
        collisionPoints.push(...geometry.samplePoints);
      }

      edgePath.setAttribute('d', geometry.pathData);
      edgePath.setAttribute('fill', 'none');
      edgePath.setAttribute('marker-end', markerUrl(EDGE_DEFAULT_MARKER_ID));
      edgePath.classList.add('markov-edge');
      edgePath.setAttribute('data-graph-target-kind', 'edge');
      edgePath.setAttribute('data-from-index', String(fromIndex));
      edgePath.setAttribute('data-to-index', String(toIndex));

      const strokeWidth = 1.2 + probability * 7.6;
      const baseOpacity = 0.14 + probability * 0.86;
      const emphasis = Math.min(1, flowMass * 11);
      const hue = 208 - emphasis * 34;
      const lightness = 34 - emphasis * 8;
      const stroke = `hsl(${hue.toFixed(1)} 72% ${lightness.toFixed(1)}%)`;

      edgePath.style.stroke = stroke;
      edgePath.style.strokeWidth = strokeWidth.toFixed(3);
      edgePath.style.opacity = Math.min(1, baseOpacity + emphasis * 0.2).toFixed(3);

      args.edgeLayer.appendChild(edgePath);
      args.currentPathByKey.set(key, edgePath);
      args.currentEdgeBaseStyles.set(key, {
        stroke,
        strokeWidth,
        opacity: Math.min(1, baseOpacity + emphasis * 0.2),
      });
      args.currentEdgeLabelPoints.set(key, geometry.labelPoint);
    }
  }

  nodeLayout.forEach((node) => {
    const nodeIndex = args.graphData.nodeIndices[node.index] ?? node.index;
    const group = createSvgElement<SVGGElement>('g');
    group.classList.add('markov-node');
    group.setAttribute('data-graph-target-kind', 'node');
    group.setAttribute('data-node-index', String(nodeIndex));

    const circle = createSvgElement<SVGCircleElement>('circle');
    circle.setAttribute('cx', node.x.toFixed(2));
    circle.setAttribute('cy', node.y.toFixed(2));
    circle.setAttribute('r', String(NODE_RADIUS));
    circle.setAttribute('fill', colorForStateValue(args.graphData.currentVector[node.index] ?? 0));
    circle.classList.add('markov-node-circle');

    const label = createSvgElement<SVGTextElement>('text');
    label.classList.add('markov-node-label');
    label.setAttribute('x', node.x.toFixed(2));
    label.setAttribute('y', (node.y + 4).toFixed(2));
    setSvgNodeLabelText(label, nodeIndex);

    group.append(circle, label);
    args.nodeLayer.appendChild(group);
    args.currentNodeCircles.set(nodeIndex, circle);
    args.currentNodeCenters.set(nodeIndex, { x: node.x, y: node.y });
  });

  args.graphSvg.setAttribute(
    'aria-description',
    `Graph rendering ${args.graphData.nodeCount} of ${args.state.nodeCount} states.`
  );
}

function createEdgePath(
  fromNode: GraphNodeLayout,
  toNode: GraphNodeLayout,
  probability: number,
  hasReverseEdge: boolean,
  isForwardPair: boolean
): PathGeometry {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const centerDistance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / centerDistance;
  const uy = dy / centerDistance;

  const perpX = -uy;
  const perpY = ux;
  const desiredLength = probabilityToEdgeLength(probability, MIN_EDGE_LENGTH, MAX_EDGE_LENGTH);
  const desiredCenterLength = desiredLength + NODE_RADIUS * 2;
  const extraLength = Math.max(0, desiredCenterLength - centerDistance);
  const variableOffset = extraLength * 0.5;
  const baseOffset = hasReverseEdge ? EDGE_REVERSE_BASE_OFFSET : EDGE_SINGLE_BASE_OFFSET;
  const bendMagnitude = Math.min(
    centerDistance * EDGE_CUBIC_MAX_OFFSET_SCALE,
    baseOffset + variableOffset
  );

  // Keep both directions for the same pair on parallel nearby tracks with opposite signed offsets.
  const pairSign = chooseDeterministicBendDirection(fromNode, toNode);
  const directionSign = hasReverseEdge ? (isForwardPair ? pairSign : -pairSign) : pairSign;
  const normalOffset = directionSign * bendMagnitude;

  const centerCurve: CubicCurve = {
    start: { x: fromNode.x, y: fromNode.y },
    controlA: {
      x: fromNode.x + ux * (centerDistance * EDGE_CUBIC_START_HANDLE) + perpX * normalOffset,
      y: fromNode.y + uy * (centerDistance * EDGE_CUBIC_START_HANDLE) + perpY * normalOffset,
    },
    controlB: {
      x: toNode.x - ux * (centerDistance * EDGE_CUBIC_END_HANDLE) + perpX * normalOffset,
      y: toNode.y - uy * (centerDistance * EDGE_CUBIC_END_HANDLE) + perpY * normalOffset,
    },
    end: { x: toNode.x, y: toNode.y },
  };

  const boundaryT = findArrowTipBoundaryT(centerCurve, { x: toNode.x, y: toNode.y }, NODE_RADIUS);
  const clippedCurve = clipCubicCurve(centerCurve, clamp(boundaryT, 0.02, 1));

  const rawLabelPoint = cubicAt(
    clippedCurve.start,
    clippedCurve.controlA,
    clippedCurve.controlB,
    clippedCurve.end,
    EDGE_LABEL_TAIL_BIAS
  );
  const labelNudge = hasReverseEdge ? 8 : 5;
  const labelDirection =
    Math.abs(normalOffset) <= PROBABILITY_EPSILON ? directionSign : Math.sign(normalOffset);
  const labelPoint = {
    x: rawLabelPoint.x + perpX * labelNudge * labelDirection,
    y: rawLabelPoint.y + perpY * labelNudge * labelDirection,
  };

  const samplePoints = sampleCubicCurve({
    start: clippedCurve.start,
    controlA: clippedCurve.controlA,
    controlB: clippedCurve.controlB,
    end: clippedCurve.end,
    sampleCount: 16,
    startT: 0.08,
    endT: 0.92,
  });

  return {
    pathData: `M ${clippedCurve.start.x.toFixed(2)} ${clippedCurve.start.y.toFixed(2)} C ${clippedCurve.controlA.x.toFixed(2)} ${clippedCurve.controlA.y.toFixed(2)} ${clippedCurve.controlB.x.toFixed(2)} ${clippedCurve.controlB.y.toFixed(2)} ${clippedCurve.end.x.toFixed(2)} ${clippedCurve.end.y.toFixed(2)}`,
    labelPoint,
    samplePoints,
  };
}

function createSelfLoopPath(options: {
  node: GraphNodeLayout;
  nodeIndex: number;
  allNodes: GraphNodeLayout[];
  existingEdgeSamples: Point[];
}): PathGeometry {
  // Evaluate deterministic angle/radius candidates and pick the one with best clearance.
  let bestGeometry: PathGeometry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const angleOffsets = buildLoopAngleOffsets();

  LOOP_RADIUS_STEPS.forEach((radiusStep) => {
    const radius = LOOP_BASE_RADIUS + radiusStep;
    angleOffsets.forEach((offset) => {
      const angle = options.node.angle + offset;
      const candidate = buildSelfLoopGeometry(options.node, angle, radius);
      const score = scoreSelfLoopGeometry({
        candidate,
        nodeIndex: options.nodeIndex,
        allNodes: options.allNodes,
        existingEdgeSamples: options.existingEdgeSamples,
        angleOffset: Math.abs(offset),
        radiusStep,
      });
      if (score > bestScore) {
        bestScore = score;
        bestGeometry = candidate;
      }
    });
  });

  return bestGeometry ?? buildSelfLoopGeometry(options.node, options.node.angle, LOOP_BASE_RADIUS);
}

function pointAroundNode(
  node: GraphNodeLayout,
  angle: number,
  radius: number
): { x: number; y: number } {
  return {
    x: node.x + Math.cos(angle) * radius,
    y: node.y + Math.sin(angle) * radius,
  };
}

function chooseDeterministicBendDirection(
  fromNode: GraphNodeLayout,
  toNode: GraphNodeLayout
): number {
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_CENTER_Y;
  const fromDx = fromNode.x - centerX;
  const fromDy = fromNode.y - centerY;
  const toDx = toNode.x - centerX;
  const toDy = toNode.y - centerY;
  const cross = fromDx * toDy - fromDy * toDx;
  if (Math.abs(cross) > PROBABILITY_EPSILON) {
    return cross > 0 ? 1 : -1;
  }
  return (fromNode.index + toNode.index) % 2 === 0 ? 1 : -1;
}

function buildSelfLoopGeometry(node: GraphNodeLayout, angle: number, radius: number): PathGeometry {
  const start = pointAroundNode(node, angle - LOOP_SPREAD, LOOP_START_ANCHOR_RADIUS);
  const end = pointAroundNode(node, angle + LOOP_SPREAD, LOOP_END_ANCHOR_RADIUS);
  const label = pointAroundNode(node, angle, LOOP_START_ANCHOR_RADIUS + radius + 12);
  const samplePoints = sampleLoopArc({
    node,
    angle,
    radius: LOOP_START_ANCHOR_RADIUS + radius * 0.82,
    sampleCount: 20,
  });

  return {
    pathData: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    labelPoint: {
      x: label.x,
      y: label.y,
    },
    samplePoints,
  };
}

function sampleLoopArc(options: {
  node: GraphNodeLayout;
  angle: number;
  radius: number;
  sampleCount: number;
}): Point[] {
  const majorSweep = Math.PI * 2 - LOOP_SPREAD * 2;
  const startAngle = options.angle - LOOP_SPREAD;
  const points: Point[] = [];

  const samples = Math.max(3, Math.floor(options.sampleCount));
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    const currentAngle = startAngle + majorSweep * t;
    points.push(pointAroundNode(options.node, currentAngle, options.radius));
  }
  return points;
}

function findArrowTipBoundaryT(curve: CubicCurve, targetCenter: Point, targetRadius: number): number {
  const sampleCount = 160;
  let previousT = 0;
  let previousError = markerTipBoundaryError(curve, previousT, targetCenter, targetRadius);
  let crossing: { lo: number; hi: number } | null = null;

  for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
    const t = sampleIndex / sampleCount;
    const error = markerTipBoundaryError(curve, t, targetCenter, targetRadius);
    if (previousError > 0 && error <= 0) {
      crossing = { lo: previousT, hi: t };
    }
    previousT = t;
    previousError = error;
  }

  if (!crossing) {
    return 1;
  }

  let lo = crossing.lo;
  let hi = crossing.hi;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const mid = (lo + hi) / 2;
    const error = markerTipBoundaryError(curve, mid, targetCenter, targetRadius);
    if (error > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

function markerTipBoundaryError(
  curve: CubicCurve,
  t: number,
  targetCenter: Point,
  targetRadius: number
): number {
  const markerTip = markerTipPointAt(curve, t);
  return Math.hypot(markerTip.x - targetCenter.x, markerTip.y - targetCenter.y) - targetRadius;
}

function markerTipPointAt(curve: CubicCurve, t: number): Point {
  const point = cubicAt(curve.start, curve.controlA, curve.controlB, curve.end, t);
  if (ARROW_TIP_OVERSHOOT <= PROBABILITY_EPSILON) {
    return point;
  }
  const tangent = cubicTangentAt(curve, t);
  return {
    x: point.x + tangent.x * ARROW_TIP_OVERSHOOT,
    y: point.y + tangent.y * ARROW_TIP_OVERSHOOT,
  };
}

function cubicTangentAt(curve: CubicCurve, t: number): Point {
  const inv = 1 - t;
  const dx =
    3 * inv * inv * (curve.controlA.x - curve.start.x) +
    6 * inv * t * (curve.controlB.x - curve.controlA.x) +
    3 * t * t * (curve.end.x - curve.controlB.x);
  const dy =
    3 * inv * inv * (curve.controlA.y - curve.start.y) +
    6 * inv * t * (curve.controlB.y - curve.controlA.y) +
    3 * t * t * (curve.end.y - curve.controlB.y);
  const magnitude = Math.hypot(dx, dy);
  if (magnitude <= PROBABILITY_EPSILON) {
    const fallbackDx = curve.end.x - curve.start.x;
    const fallbackDy = curve.end.y - curve.start.y;
    const fallbackMagnitude = Math.max(PROBABILITY_EPSILON, Math.hypot(fallbackDx, fallbackDy));
    return {
      x: fallbackDx / fallbackMagnitude,
      y: fallbackDy / fallbackMagnitude,
    };
  }
  return {
    x: dx / magnitude,
    y: dy / magnitude,
  };
}

function clipCubicCurve(curve: CubicCurve, t: number): CubicCurve {
  const p01 = lerpPoint(curve.start, curve.controlA, t);
  const p12 = lerpPoint(curve.controlA, curve.controlB, t);
  const p23 = lerpPoint(curve.controlB, curve.end, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const p0123 = lerpPoint(p012, p123, t);

  return {
    start: curve.start,
    controlA: p01,
    controlB: p012,
    end: p0123,
  };
}

function lerpPoint(from: Point, to: Point, t: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function buildLoopAngleOffsets(): number[] {
  const offsets: number[] = [0];
  for (let sweep = 1; sweep <= LOOP_ANGLE_SWEEPS; sweep += 1) {
    const delta = sweep * LOOP_ANGLE_STEP;
    offsets.push(delta, -delta);
  }
  return offsets;
}

function scoreSelfLoopGeometry(options: {
  candidate: PathGeometry;
  nodeIndex: number;
  allNodes: GraphNodeLayout[];
  existingEdgeSamples: Point[];
  angleOffset: number;
  radiusStep: number;
}): number {
  const edgeClearance = minimumDistanceBetweenPointSets(
    options.candidate.samplePoints,
    options.existingEdgeSamples
  );
  const nodeClearance = minimumClearanceToOtherNodes(
    options.candidate.samplePoints,
    options.allNodes,
    options.nodeIndex
  );
  const boundaryClearance = minimumBoundaryClearance(options.candidate.samplePoints);
  const anglePenalty = options.angleOffset * 3.2;
  const radiusPenalty = options.radiusStep * 0.06;
  return Math.min(edgeClearance, nodeClearance, boundaryClearance) - anglePenalty - radiusPenalty;
}

function minimumDistanceBetweenPointSets(left: readonly Point[], right: readonly Point[]): number {
  if (left.length === 0 || right.length === 0) {
    return 1000;
  }

  let minDistance = Number.POSITIVE_INFINITY;
  left.forEach((leftPoint) => {
    right.forEach((rightPoint) => {
      const distance = Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y);
      if (distance < minDistance) {
        minDistance = distance;
      }
    });
  });
  return minDistance;
}

function minimumClearanceToOtherNodes(
  samples: readonly Point[],
  allNodes: readonly GraphNodeLayout[],
  nodeIndex: number
): number {
  if (allNodes.length <= 1) {
    return 1000;
  }

  let minClearance = Number.POSITIVE_INFINITY;
  samples.forEach((sample) => {
    allNodes.forEach((node) => {
      if (node.index === nodeIndex) return;
      const centerDistance = Math.hypot(sample.x - node.x, sample.y - node.y);
      const clearance = centerDistance - (NODE_RADIUS + 4);
      if (clearance < minClearance) {
        minClearance = clearance;
      }
    });
  });

  return minClearance;
}

function minimumBoundaryClearance(samples: readonly Point[]): number {
  if (samples.length === 0) {
    return 0;
  }

  let minClearance = Number.POSITIVE_INFINITY;
  samples.forEach((sample) => {
    const clearance = Math.min(sample.x, GRAPH_WIDTH - sample.x, sample.y, GRAPH_HEIGHT - sample.y);
    if (clearance < minClearance) {
      minClearance = clearance;
    }
  });
  return minClearance;
}

function cubicAt(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const inv = 1 - t;
  const x =
    inv * inv * inv * start.x +
    3 * inv * inv * t * controlA.x +
    3 * inv * t * t * controlB.x +
    t * t * t * end.x;
  const y =
    inv * inv * inv * start.y +
    3 * inv * inv * t * controlA.y +
    3 * inv * t * t * controlB.y +
    t * t * t * end.y;
  return { x, y };
}

function sampleCubicCurve(options: {
  start: Point;
  controlA: Point;
  controlB: Point;
  end: Point;
  sampleCount: number;
  startT: number;
  endT: number;
}): Point[] {
  const samples = Math.max(2, Math.floor(options.sampleCount));
  const points: Point[] = [];
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    const progress = sampleIndex / (samples - 1);
    const t = options.startT + (options.endT - options.startT) * progress;
    points.push(cubicAt(options.start, options.controlA, options.controlB, options.end, t));
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function colorForHighlightedNodeValue(value: number): string {
  const normalized = clamp01(value);
  const hue = 3;
  const saturation = 84;
  const lightness = 93 - normalized * 52;
  return `hsl(${hue} ${saturation}% ${lightness.toFixed(1)}%)`;
}

function setSvgNodeLabelText(label: SVGTextElement, nodeIndex: number, suffix = ''): void {
  label.replaceChildren();

  const symbol = createSvgElement<SVGTSpanElement>('tspan');
  symbol.textContent = 'N';

  const subscript = createSvgElement<SVGTSpanElement>('tspan');
  subscript.classList.add('markov-svg-node-subscript');
  subscript.setAttribute('baseline-shift', 'sub');
  subscript.textContent = String(nodeIndex + 1);

  label.append(symbol, subscript);
  if (suffix.length > 0) {
    const suffixSpan = createSvgElement<SVGTSpanElement>('tspan');
    suffixSpan.setAttribute('baseline-shift', 'baseline');
    suffixSpan.textContent = suffix;
    label.appendChild(suffixSpan);
  }
}

function parseEdgeKey(key: string): { fromIndex: number; toIndex: number } | null {
  const match = /^edge-(\d+)-(\d+)$/.exec(key);
  if (!match) return null;
  return {
    fromIndex: Number.parseInt(match[1], 10),
    toIndex: Number.parseInt(match[2], 10),
  };
}

function normalizeSubgraphSelection(
  selection: Partial<GraphSubgraphSelection>,
  fallback: GraphSubgraphSelection
): GraphSubgraphSelection {
  const mode =
    selection.mode === 'all' || selection.mode === 'top-state-mass'
      ? selection.mode
      : fallback.mode;

  const maxNodesRaw =
    typeof selection.maxNodes === 'number' && Number.isFinite(selection.maxNodes)
      ? selection.maxNodes
      : fallback.maxNodes;
  const maxNodes = Math.max(2, Math.floor(maxNodesRaw));

  const minEdgeProbabilityRaw =
    typeof selection.minEdgeProbability === 'number' && Number.isFinite(selection.minEdgeProbability)
      ? selection.minEdgeProbability
      : fallback.minEdgeProbability;
  const minEdgeProbability = clamp(minEdgeProbabilityRaw, 0, 1);

  return {
    mode,
    maxNodes,
    minEdgeProbability,
  };
}

function isSameSubgraphSelection(
  left: GraphSubgraphSelection,
  right: GraphSubgraphSelection
): boolean {
  return (
    left.mode === right.mode &&
    left.maxNodes === right.maxNodes &&
    Math.abs(left.minEdgeProbability - right.minEdgeProbability) <= 1e-9
  );
}

function markerUrl(markerId: string): string {
  return `url(#${markerId})`;
}

function readGraphTarget(eventTarget: EventTarget | null): GraphInteractionTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const graphTargetElement = eventTarget.closest('[data-graph-target-kind]');
  if (!graphTargetElement) {
    return null;
  }

  const kind = graphTargetElement.getAttribute('data-graph-target-kind');
  if (kind === 'node') {
    const nodeIndex = Number.parseInt(graphTargetElement.getAttribute('data-node-index') ?? '', 10);
    if (!Number.isInteger(nodeIndex)) return null;
    return {
      kind: 'node',
      nodeIndex,
    };
  }

  if (kind === 'edge') {
    const fromIndex = Number.parseInt(graphTargetElement.getAttribute('data-from-index') ?? '', 10);
    const toIndex = Number.parseInt(graphTargetElement.getAttribute('data-to-index') ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return null;
    return {
      kind: 'edge',
      fromIndex,
      toIndex,
    };
  }

  return null;
}

function createSvgElement<T extends SVGElement>(tagName: string): T {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName) as T;
}

function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement for graph panel.');
  }
  return node;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
