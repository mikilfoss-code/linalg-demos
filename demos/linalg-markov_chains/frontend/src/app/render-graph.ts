import type { Action } from './actions';
import type {
  AppState,
  MarkovDatasetId,
  MarkovDatasetLayoutId,
  MarkovDatasetPresetId,
  MarkovSourceMode,
} from './types';
import {
  formatEditableInputValue,
  moveCaretToEnd,
  readNonNegativeDraftInputValue,
  shouldUseDestructiveOverwrite,
} from './edit-value-input';
import { createTemplateElement, requireElement } from './dom-helpers';
import { selectDisplayedNodeValue, selectDisplayedTransitionCell } from './selectors';
import {
  DEFAULT_GRAPH_SUBGRAPH_SELECTION,
  buildGraphRenderData,
  type GraphRenderData,
  type GraphSubgraphSelection,
} from './graph-data';
import {
  COMMUNITY_FORCE_GRAPH_LAYOUT_STRATEGY_ID,
  DEFAULT_GRAPH_LAYOUT_STRATEGY_ID,
  RADIAL_ANCHOR_GRAPH_LAYOUT_STRATEGY_ID,
  RANK_LAYERED_GRAPH_LAYOUT_STRATEGY_ID,
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
const MIN_EDGE_LENGTH = 80;
const MAX_EDGE_LENGTH = 316;
const EDGE_LABEL_TAIL_BIAS = 0.33;
const ARROW_HEAD_BASE_WIDTH = 16;
const ARROW_HEAD_BASE_HEIGHT = 12;
const ARROW_HEAD_BASE_REF_X = 5.1;
const ARROW_TIP_OVERSHOOT = Math.max(0, ARROW_HEAD_BASE_WIDTH - ARROW_HEAD_BASE_REF_X);
const ARROW_HEAD_STROKE_BASELINE = 1.2;
const ARROW_HEAD_GROWTH_PER_STROKE = 0.08;
const ARROW_HEAD_MAX_SCALE = 1.6;
const ARROW_HEAD_SIZE_BUCKET_STEP = 0.25;
const LOOP_BASE_RADIUS = NODE_RADIUS * 1.2;
const LOOP_RADIUS_STEPS = [0, 2, 4, 6];
const LOOP_ANGLE_STEP = Math.PI / 10;
const LOOP_ANGLE_SWEEPS = 6;
const LOOP_SPREAD = 0.78;
const LOOP_START_ANCHOR_RADIUS = NODE_RADIUS;
const LOOP_END_ANCHOR_RADIUS = NODE_RADIUS + ARROW_TIP_OVERSHOOT;
const EDGE_CUBIC_START_HANDLE = 0.34;
const EDGE_CUBIC_END_HANDLE = 0.46;
const EDGE_REVERSE_BASE_OFFSET = 15;
const EDGE_SINGLE_BASE_OFFSET = 9;
const EDGE_CUBIC_MAX_OFFSET_SCALE = 0.58;
const EDGE_MAX_AVOIDANCE_OFFSET_SCALE = 1;
const EDGE_NODE_CLEARANCE_MARGIN = 0.2;
const EDGE_BEND_SCALE_CANDIDATES = [0.6, 0.8, 1, 1.3, 1.6, 1.9, 2.2, 2.5] as const;
const EDGE_DEFAULT_MARKER_ID_PREFIX = 'markov-arrow-head';
const EDGE_HIGHLIGHT_MARKER_ID_PREFIX = 'markov-arrow-head-highlight';
const EDGE_HIGHLIGHT_STROKE = 'hsl(2 72% 46%)';
const NODE_HIGHLIGHT_STROKE = 'hsl(2 72% 46%)';
const NODE_DEFAULT_STROKE = 'rgba(9, 39, 63, 0.45)';
const NODE_DEFAULT_STROKE_WIDTH = 1.4;
const NODE_HIGHLIGHT_STROKE_WIDTH = 3;
const INLINE_EDGE_EDITOR_WIDTH = 70;
const INLINE_EDGE_EDITOR_HEIGHT = 34;
const INLINE_NODE_EDITOR_WIDTH = 70;
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
const MIN_NODE_DIAMETER_HEIGHT_RATIO = 0.045;
const MAX_NODE_DIAMETER_HEIGHT_RATIO = 0.5;
const MIN_GRAPH_SCALE = (GRAPH_HEIGHT * MIN_NODE_DIAMETER_HEIGHT_RATIO) / (NODE_RADIUS * 2);
const MAX_GRAPH_SCALE = (GRAPH_HEIGHT * MAX_NODE_DIAMETER_HEIGHT_RATIO) / (NODE_RADIUS * 2);
const KEYBOARD_ZOOM_STEP = 1.12;
const WHEEL_ZOOM_IN_STEP = 1.11;
const WHEEL_ZOOM_OUT_STEP = 1 / WHEEL_ZOOM_IN_STEP;
const KEYBOARD_PAN_STEP = 30;
const PAN_BLOCKED_NOTICE_MS = 200;
const PAN_PROJECTION_START_DELAY_MS = 50;
const PROJECTION_ANIMATION_DURATION_MS = 300;
const DATASET_ACCELERATION_MIN_NODE_COUNT = 20;
const PATH_SAMPLE_SPACING_PX = 8;
const PATH_SAMPLE_MIN_COUNT = 20;
const PATH_SAMPLE_MAX_COUNT = 160;

const GRAPH_LAYOUT_ENGINE = createGraphLayoutEngine({
  defaultStrategyId: DEFAULT_GRAPH_LAYOUT_STRATEGY_ID,
});

/**
 * Purpose: Define a 2D coordinate used for graph geometry and viewport math.
 * Key fields: See the declared properties in this type definition.
 */
type Point = {
  x: number;
  y: number;
};

type PanDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Purpose: Define an axis-aligned rectangle used for annotation placement and overlap scoring.
 * Key fields: See the declared properties in this type definition.
 */
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Purpose: Define a circular obstacle used in edge and loop clearance scoring.
 * Key fields: See the declared properties in this type definition.
 */
type CircleObstacle = {
  x: number;
  y: number;
  radius: number;
};

/**
 * Purpose: Define SVG path geometry plus sampled points used for labels and collision checks.
 * Key fields: See the declared properties in this type definition.
 */
type PathGeometry = {
  pathData: string;
  labelPoint: Point;
  samplePoints: Point[];
};

/**
 * Purpose: Cache sampled path points/tangents for fast particle frame interpolation.
 * Key fields: Evenly sampled arclength bins and per-bin position/tangent vectors.
 */
type PathSampleCache = {
  totalLength: number;
  sampleLengths: Float32Array;
  pointsX: Float32Array;
  pointsY: Float32Array;
  tangentsX: Float32Array;
  tangentsY: Float32Array;
};

/**
 * Purpose: Define cubic Bezier control points used for directed edge geometry.
 * Key fields: See the declared properties in this type definition.
 */
type CubicCurve = {
  start: Point;
  controlA: Point;
  controlB: Point;
  end: Point;
};

/**
 * Purpose: Define runtime flow-particle state for edge animation playback.
 * Key fields: Path references, timing metadata, and along/normal offsets.
 */
type RuntimeParticle = {
  path: SVGPathElement;
  sampledPath: PathSampleCache | null;
  length: number;
  element: SVGCircleElement;
  delayMs: number;
  durationMs: number;
  pathPhase: number;
  offsetNormal: number;
};

/**
 * Purpose: Define stroke styling applied to normal vs highlighted edges.
 * Key fields: See the declared properties in this type definition.
 */
type EdgeVisualStyle = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

/**
 * Purpose: Track geometry-driving state fields used to decide when a full SVG rebuild is required.
 * Key fields: Layout/source mode, visible-node ordering, edge set, and matrix identity.
 */
type GraphGeometrySignature = {
  layoutStrategyId: string;
  sourceMode: MarkovSourceMode;
  nodeCount: number;
  stateNodeCount: number;
  nodeIndices: number[];
  edgeKeys: string[];
  transitionMatrixRef: number[][];
};

/**
 * Purpose: Define the controller contract exposed by the graph panel module.
 * Key fields: Root element reference plus render/highlight/viewport control methods.
 */
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
 * Snapshot of graph interaction + viewport context used to coordinate matrix/state panels.
 */
export type GraphPanelContextSnapshot = {
  renderedNodeIndices: number[];
  viewportVisibleNodeIndices: number[];
  activeTarget: GraphInteractionTarget | null;
  selectedTarget: GraphInteractionTarget | null;
};

/**
 * Create the graph panel and run edge-flow animation for each step transition.
 */
export function createGraphPanelController(options: {
  dispatch: (action: Action) => void;
  onFlowAnimationComplete: (animationId: number) => void;
  onSetNodeCount: (nodeCount: number) => void;
  onGenerateRandomDirectedGraph: () => void;
  onSetSourceMode: (mode: MarkovSourceMode) => void;
  onSetDatasetId: (datasetId: MarkovDatasetId) => void;
  onSetDatasetPreset: (presetId: MarkovDatasetPresetId) => void;
  onSetDatasetLayout: (layoutId: MarkovDatasetLayoutId) => void;
  onSetDatasetTargetNodeCount: (nodeCount: number) => void;
  onExtractDatasetSubgraph: () => void;
  onContextChange?: (context: GraphPanelContextSnapshot) => void;
}): GraphPanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-graph">
      <h2 class="base-panel-title">Transition Graph</h2>
      <div class="markov-graph-controls">
        <div class="markov-control-row markov-control-row--source">
          <label class="markov-control-label" for="graph-source-mode-select">Source</label>
          <select id="graph-source-mode-select" class="markov-select-input">
            <option value="manual">Manual / Random</option>
            <option value="dataset">Dataset</option>
          </select>

          <button
            class="base-button base-button--secondary"
            type="button"
            data-action="extract-dataset-subgraph"
          >
            Load Dataset Subgraph
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

        <div class="markov-control-row markov-control-row--mode">
          <div class="markov-manual-controls">
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
            <button
              class="base-button base-button--secondary"
              type="button"
              data-action="randomize-directed-graph"
            >
              Random Directed Graph
            </button>
          </div>

          <div class="markov-dataset-selection-controls">
            <label class="markov-control-label" for="graph-dataset-select">Dataset</label>
            <select id="graph-dataset-select" class="markov-select-input">
              <option value="web-google">Google web graph (SNAP)</option>
            </select>

            <label class="markov-control-label" for="graph-dataset-preset-select">Preset</label>
            <select id="graph-dataset-preset-select" class="markov-select-input">
              <option value="balanced_instructional">Balanced instructional</option>
              <option value="community_lens">Community lens</option>
              <option value="authority_hub_contrast">Authority-hub contrast</option>
              <option value="dangling_stress">Dangling stress</option>
              <option value="random_baseline">Random baseline</option>
            </select>

            <label class="markov-control-label" for="graph-layout-select">Layout</label>
            <select id="graph-layout-select" class="markov-select-input">
              <option value="rank_layered">Rank layered</option>
              <option value="community_force">Community force</option>
              <option value="radial_anchor">Radial anchor</option>
            </select>

            <label class="markov-control-label" for="graph-dataset-target-count">Nodes</label>
            <input
              id="graph-dataset-target-count"
              class="markov-number-mini-input"
              type="number"
              min="20"
              max="320"
              step="1"
              value="40"
            />
          </div>
        </div>
      </div>
      <p class="markov-graph-status" id="markov-graph-status" role="status" aria-live="polite"></p>

      <svg
        class="markov-graph"
        id="markov-graph"
        viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}"
        role="img"
        aria-label="Directed Markov transition graph"
      >
        <defs id="arrow-marker-defs"></defs>
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
  const markerDefs = requireElement<SVGDefsElement>(element, '#arrow-marker-defs');
  const viewportLayer = requireElement<SVGGElement>(element, '#viewport-layer');
  const edgeLayer = requireElement<SVGGElement>(element, '#edge-layer');
  const particleLayer = requireElement<SVGGElement>(element, '#particle-layer');
  const nodeLayer = requireElement<SVGGElement>(element, '#node-layer');
  const annotationLayer = requireElement<SVGGElement>(element, '#annotation-layer');
  const sourceModeSelect = requireElement<HTMLSelectElement>(element, '#graph-source-mode-select');
  const datasetSelect = requireElement<HTMLSelectElement>(element, '#graph-dataset-select');
  const datasetPresetSelect = requireElement<HTMLSelectElement>(
    element,
    '#graph-dataset-preset-select'
  );
  const datasetLayoutSelect = requireElement<HTMLSelectElement>(element, '#graph-layout-select');
  const datasetTargetCountInput = requireElement<HTMLInputElement>(
    element,
    '#graph-dataset-target-count'
  );
  const graphControls = requireElement<HTMLElement>(element, '.markov-graph-controls');
  const manualControlsBlock = requireElement<HTMLElement>(element, '.markov-manual-controls');
  const datasetSelectionControlsBlock = requireElement<HTMLElement>(
    element,
    '.markov-dataset-selection-controls'
  );
  const nodeCountRange = requireElement<HTMLInputElement>(element, '#graph-node-count-range');
  const nodeCountNumber = requireElement<HTMLInputElement>(element, '#graph-node-count-number');
  const randomizeDirectedGraphButton = requireElement<HTMLButtonElement>(
    element,
    '[data-action="randomize-directed-graph"]'
  );
  const loadDatasetSubgraphButton = requireElement<HTMLButtonElement>(
    element,
    '[data-action="extract-dataset-subgraph"]'
  );
  const toggleAllValuesButton = requireElement<HTMLButtonElement>(
    element,
    '#toggle-all-values-button'
  );
  const graphStatus = requireElement<HTMLElement>(element, '#markov-graph-status');
  const arrowMarkerCache = new Map<string, string>();

  nodeCountRange.addEventListener('input', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.onSetNodeCount(value);
    resetViewportToDefault();
  });

  nodeCountNumber.addEventListener('change', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.onSetNodeCount(value);
    resetViewportToDefault();
  });

  sourceModeSelect.addEventListener('change', (event) => {
    const mode = (event.target as HTMLSelectElement).value;
    if (mode === 'manual' || mode === 'dataset') {
      options.onSetSourceMode(mode);
    }
  });

  datasetPresetSelect.addEventListener('change', (event) => {
    const presetId = (event.target as HTMLSelectElement).value;
    if (
      presetId === 'balanced_instructional' ||
      presetId === 'community_lens' ||
      presetId === 'authority_hub_contrast' ||
      presetId === 'dangling_stress' ||
      presetId === 'random_baseline'
    ) {
      options.onSetDatasetPreset(presetId);
    }
  });

  datasetSelect.addEventListener('change', (event) => {
    const datasetId = (event.target as HTMLSelectElement).value;
    if (datasetId === 'web-google') {
      options.onSetDatasetId(datasetId);
    }
  });

  datasetLayoutSelect.addEventListener('change', (event) => {
    const layoutId = (event.target as HTMLSelectElement).value;
    if (layoutId === 'rank_layered' || layoutId === 'community_force' || layoutId === 'radial_anchor') {
      options.onSetDatasetLayout(layoutId);
    }
  });

  datasetTargetCountInput.addEventListener('change', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.onSetDatasetTargetNodeCount(value);
  });

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === 'extract-dataset-subgraph') {
      options.onExtractDatasetSubgraph();
      resetViewportToDefault();
      return;
    }
    if (target.dataset.action === 'randomize-directed-graph') {
      options.onGenerateRandomDirectedGraph();
      resetViewportToDefault();
      return;
    }
    if (target.dataset.action === 'toggle-all-values') {
      showAllValues = !showAllValues;
      updateToggleAllValuesButton();
      applyInteractionPresentation();
    }
  });

  element.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.action?.startsWith('graph-set-')) return;
    stageGraphEditorDraftFromInput(target, { preserveFocus: true });
  });

  graphSvg.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const rect = graphSvg.getBoundingClientRect();
      const focal = {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * GRAPH_WIDTH,
        y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * GRAPH_HEIGHT,
      };
      const zoomFactor = event.deltaY < 0 ? WHEEL_ZOOM_IN_STEP : WHEEL_ZOOM_OUT_STEP;
      zoomViewport(zoomFactor, focal);
    },
    { passive: false }
  );

  graphSvg.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) {
      return;
    }
    isPanDragging = true;
    didPanDuringDrag = false;
    panPointerId = event.pointerId;
    lastPanClientPoint = {
      x: event.clientX,
      y: event.clientY,
    };
    graphSvg.setPointerCapture(event.pointerId);
    clearGraphStatus();
    event.preventDefault();
  });

  graphSvg.addEventListener('pointerup', (event) => {
    finishPanDrag(event.pointerId);
  });

  graphSvg.addEventListener('pointercancel', (event) => {
    finishPanDrag(event.pointerId);
  });

  graphSvg.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  graphSvg.addEventListener('pointermove', (event) => {
    if (focusedGraphEditorInput || externalFocusTarget) {
      return;
    }
    if (isPanDragging) {
      handlePanDragMove(event);
      return;
    }
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
    if (focusedGraphEditorInput || externalFocusTarget) {
      return;
    }
    if (!interactionState.hovered) return;
    interactionState = {
      ...interactionState,
      hovered: null,
    };
    applyInteractionPresentation();
  });

  graphSvg.addEventListener('click', (event) => {
    if (didPanDuringDrag) {
      didPanDuringDrag = false;
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.dataset.action?.startsWith('graph-set-')
    ) {
      return;
    }
    const clickedTarget = readGraphTarget(event.target);
    if (isSameGraphInteractionTarget(interactionState.selected, clickedTarget)) {
      return;
    }
    pendingGraphEditorFocusTarget = clickedTarget
      ? {
          target: clickedTarget,
          armOverwrite: true,
        }
      : null;
    interactionState = {
      ...interactionState,
      selected: clickedTarget,
    };
    applyInteractionPresentation();
  });

  element.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.action?.startsWith('graph-set-')) return;
    const editorTarget = readGraphEditorTarget(target);
    if (
      editorTarget &&
      !isSameGraphInteractionTarget(interactionState.selected, editorTarget)
    ) {
      pendingGraphEditorFocusTarget = {
        target: editorTarget,
        armOverwrite: true,
      };
      interactionState = {
        ...interactionState,
        hovered: null,
        selected: editorTarget,
      };
      dispatchGraphEditFocus(editorTarget, 'focus');
      applyInteractionPresentation();
      return;
    }
    if (editorTarget) {
      dispatchGraphEditFocus(editorTarget, 'focus');
    }
    interactionState = {
      ...interactionState,
      hovered: null,
    };
    armGraphEditorForDestructiveOverwrite(target);
    focusedGraphEditorInput = target;
    emitGraphContextChange();
  });

  element.addEventListener('focusout', (event) => {
    if (!(event instanceof FocusEvent)) return;
    const related = event.relatedTarget;
    if (
      related instanceof HTMLInputElement &&
      related.dataset.action?.startsWith('graph-set-')
    ) {
      return;
    }
    if (focusedGraphEditorInput) {
      focusedGraphEditorInput.classList.remove('markov-input-caret-red', 'markov-input-caret-blue');
    }
    focusedGraphEditorInput = null;
    overwriteArmedGraphEditorInput = null;
  });

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.action?.startsWith('graph-set-')) return;
    const isAlreadyActiveInput = document.activeElement === target;
    const editorTarget = readGraphEditorTarget(target);
    if (
      editorTarget &&
      !isSameGraphInteractionTarget(interactionState.selected, editorTarget)
    ) {
      pendingGraphEditorFocusTarget = {
        target: editorTarget,
        armOverwrite: true,
      };
      interactionState = {
        ...interactionState,
        hovered: null,
        selected: editorTarget,
      };
      dispatchGraphEditFocus(editorTarget, 'click');
      applyInteractionPresentation();
      return;
    }
    if (editorTarget && !isAlreadyActiveInput) {
      dispatchGraphEditFocus(editorTarget, 'click');
    }
    interactionState = {
      ...interactionState,
      hovered: null,
    };
    focusedGraphEditorInput = target;
    if (isAlreadyActiveInput) {
      if (overwriteArmedGraphEditorInput === target) {
        disarmGraphEditorForInsertMode(target);
      } else {
        armGraphEditorForDestructiveOverwrite(target);
      }
    } else {
      armGraphEditorForDestructiveOverwrite(target);
    }
    emitGraphContextChange();
  });

  element.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.action?.startsWith('graph-set-')) return;
    handleGraphEditorInputKeyDown(event, target);
  });

  const handleWindowKeyDown = (event: KeyboardEvent) => {
    if (shouldIgnoreGraphKeyEvent(event)) {
      return;
    }

    const zoomIn =
      event.key === '+' ||
      event.key === '=' ||
      event.key === 'NumpadAdd' ||
      (event.code === 'Equal' && event.shiftKey);
    if (zoomIn) {
      event.preventDefault();
      zoomViewport(KEYBOARD_ZOOM_STEP, {
        x: GRAPH_WIDTH / 2,
        y: GRAPH_HEIGHT / 2,
      });
      return;
    }

    const zoomOut = event.key === '-' || event.key === '_' || event.key === 'NumpadSubtract';
    if (zoomOut) {
      event.preventDefault();
      zoomViewport(1 / KEYBOARD_ZOOM_STEP, {
        x: GRAPH_WIDTH / 2,
        y: GRAPH_HEIGHT / 2,
      });
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      activeArrowPanKeys.add('ArrowLeft');
      panViewport({ x: -KEYBOARD_PAN_STEP, y: 0 }, 'left');
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      activeArrowPanKeys.add('ArrowRight');
      panViewport({ x: KEYBOARD_PAN_STEP, y: 0 }, 'right');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeArrowPanKeys.add('ArrowUp');
      panViewport({ x: 0, y: -KEYBOARD_PAN_STEP }, 'up');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeArrowPanKeys.add('ArrowDown');
      panViewport({ x: 0, y: KEYBOARD_PAN_STEP }, 'down');
    }
  };
  window.addEventListener('keydown', handleWindowKeyDown);

  const handleWindowGraphEditorKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key !== 'Tab' && event.key !== 'Enter' && event.key !== 'Escape') {
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) {
      return;
    }
    if (!element.contains(active)) {
      return;
    }
    if (!active.dataset.action?.startsWith('graph-set-')) {
      return;
    }
    handleGraphEditorInputKeyDown(event, active);
  };
  window.addEventListener('keydown', handleWindowGraphEditorKeyDown, true);

  const handleWindowKeyUp = (event: KeyboardEvent) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) {
      return;
    }

    activeArrowPanKeys.delete(event.key);
    if (activeArrowPanKeys.size === 0) {
      cancelViewportProjectionAnimation();
    }
  };
  window.addEventListener('keyup', handleWindowKeyUp);

  const handleWindowBlur = () => {
    activeArrowPanKeys.clear();
    cancelViewportProjectionAnimation();
  };
  window.addEventListener('blur', handleWindowBlur);

  const handleWindowPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const isNormalizeButtonClick = Boolean(target.closest('[data-action="normalize-matrix"]'));
    if (isNormalizeButtonClick) {
      closeActiveGraphEditor();
      if (hasPendingGraphDrafts()) {
        commitGraphDraftsAndNormalize('normalize_button');
      } else {
        applyInteractionPresentation();
      }
      return;
    }

    const isGraphInput =
      target instanceof HTMLInputElement && target.dataset.action?.startsWith('graph-set-');
    const isSameFocusedGraphInput =
      Boolean(focusedGraphEditorInput) && target === focusedGraphEditorInput;

    if (focusedGraphEditorInput && !isSameFocusedGraphInput) {
      discardGraphDrafts('outside_click');
      if (focusedGraphEditorInput.isConnected) {
        focusedGraphEditorInput.blur();
      }
    }

    if (hasPendingGraphDrafts() && !isGraphInput) {
      discardGraphDrafts('outside_click');
    }

    const graphTarget = readGraphTarget(target);
    const isInsideGraph = graphSvg.contains(target);

    if (!interactionState.selected) {
      return;
    }

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
  let currentPathSamplesByKey = new Map<string, PathSampleCache>();
  let currentEdgeBaseStyles = new Map<string, EdgeVisualStyle>();
  let currentEdgeLabelPoints = new Map<string, Point>();
  let currentNodeCenters = new Map<number, Point>();
  let currentHighlightedNodeIndices = new Set<number>();
  let interactionState = createEmptyGraphInteractionState();
  let externalHoverTarget: GraphInteractionTarget | null = null;
  let externalFocusTarget: GraphInteractionTarget | null = null;
  let lastRenderedState: AppState | null = null;
  let lastGraphData: GraphRenderData | null = null;
  let pendingGraphEditorFocusTarget: {
    target: GraphInteractionTarget;
    armOverwrite: boolean;
  } | null = null;
  let focusedGraphEditorInput: HTMLInputElement | null = null;
  let overwriteArmedGraphEditorInput: HTMLInputElement | null = null;
  let lastAutoCenteredEditTargetKey: string | null = null;
  let showAllValues = false;
  let isAnimationRunning = false;
  let isPanDragging = false;
  let didPanDuringDrag = false;
  let panPointerId: number | null = null;
  let lastPanClientPoint: Point | null = null;
  let activeArrowPanKeys = new Set<string>();
  let graphStatusTimeoutId: number | null = null;
  let viewportProjectionAnimationHandle: number | null = null;
  let viewportProjectionStartTimeoutId: number | null = null;
  let viewportProjectionAnimationToken = 0;
  let viewportProjectionTarget: GraphViewportTransform | null = null;
  let lastEmittedContext: GraphPanelContextSnapshot | null = null;
  let lastGeometrySignature: GraphGeometrySignature | null = null;
  let hasRenderedAtLeastOnce = false;
  let subgraphSelection: GraphSubgraphSelection = {
    ...DEFAULT_GRAPH_SUBGRAPH_SELECTION,
  };
  let viewportTransform = createDefaultGraphViewportTransform();
  applyViewportTransformImmediate(viewportTransform);
  clearGraphStatus();
  updateToggleAllValuesButton();

  const controller: GraphPanelController = {
    element,
    render(state) {
      hasRenderedAtLeastOnce = true;
      lastRenderedState = state;
      lastGraphData = buildGraphRenderData(state, subgraphSelection);
      const layoutStrategyId = resolveLayoutStrategyId(state);
      const useAcceleratedGraphRendering = shouldUseAcceleratedGraphRendering(state);
      const geometrySignature = createGraphGeometrySignature({
        state,
        graphData: lastGraphData,
        layoutStrategyId,
      });
      const shouldRebuildGeometry =
        !useAcceleratedGraphRendering ||
        !isSameGraphGeometrySignature(lastGeometrySignature, geometrySignature);
      applyViewportTransformImmediate(viewportTransform);
      sourceModeSelect.value = state.sourceMode;
      syncDatasetSelectOptions(state);
      datasetSelect.value = state.dataset.selectedDatasetId;
      syncPresetSelectOptions(state);
      datasetPresetSelect.value = state.dataset.selectedPresetId;
      datasetLayoutSelect.value = state.dataset.selectedLayoutId;
      datasetTargetCountInput.value = String(state.dataset.targetNodeCount);
      nodeCountRange.value = String(state.nodeCount);
      nodeCountNumber.value = String(state.nodeCount);
      const isDatasetMode = state.sourceMode === 'dataset';
      graphControls.hidden = false;
      manualControlsBlock.style.display = isDatasetMode ? 'none' : 'flex';
      datasetSelectionControlsBlock.style.display = isDatasetMode ? 'flex' : 'none';
      loadDatasetSubgraphButton.style.display = isDatasetMode ? '' : 'none';
      nodeCountRange.disabled = isDatasetMode;
      nodeCountNumber.disabled = isDatasetMode;
      randomizeDirectedGraphButton.disabled = isDatasetMode;
      datasetPresetSelect.disabled = !isDatasetMode || state.dataset.isExtracting;
      datasetLayoutSelect.disabled = !isDatasetMode || state.dataset.isExtracting;
      datasetTargetCountInput.disabled = !isDatasetMode || state.dataset.isExtracting;
      loadDatasetSubgraphButton.disabled = !isDatasetMode || state.dataset.isExtracting;
      if (state.dataset.isExtracting) {
        setGraphStatus('Loading dataset subgraph…');
      } else if (state.dataset.error) {
        setGraphStatus(state.dataset.error, { sticky: true });
      } else {
        clearGraphStatus();
      }
      updateToggleAllValuesButton();
      interactionState = sanitizeGraphInteractionState(interactionState, state);
      externalHoverTarget = sanitizeExternalTarget(externalHoverTarget, state);
      externalFocusTarget = sanitizeExternalTarget(externalFocusTarget, state);

      if (shouldRebuildGeometry) {
        drawGraph({
          state,
          layoutStrategyId,
          graphData: lastGraphData,
          graphSvg,
          edgeLayer,
          annotationLayer,
          nodeLayer,
          currentNodeCircles,
          currentPathByKey,
          currentPathSamplesByKey,
          currentEdgeBaseStyles,
          currentEdgeLabelPoints,
          currentNodeCenters,
          markerDefs,
          arrowMarkerCache,
          samplePathsForAnimation: useAcceleratedGraphRendering,
        });
      }
      lastGeometrySignature = geometrySignature;
      viewportTransform = normalizeViewportTransformForNodes(viewportTransform);
      applyViewportTransformImmediate(viewportTransform);
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
        pathSamplesByKey: currentPathSamplesByKey,
        usePathSampling: useAcceleratedGraphRendering,
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
      cancelViewportProjectionAnimation();
      viewportTransform = normalizeViewportTransformForNodes(
        normalizeGraphViewportTransform(transform, viewportTransform)
      );
      applyViewportTransformImmediate(viewportTransform);
    },
    resetViewportTransform() {
      resetViewportToDefault();
    },
    destroy() {
      cancelAnimationLoop();
      cancelViewportProjectionAnimation();
      window.removeEventListener('pointerdown', handleWindowPointerDown, true);
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keydown', handleWindowGraphEditorKeyDown, true);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      if (graphStatusTimeoutId !== null) {
        window.clearTimeout(graphStatusTimeoutId);
        graphStatusTimeoutId = null;
      }
    },
  };
  return controller;

  /**
   * Purpose: Apply hover/selection presentation state to node and edge SVG elements.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function applyInteractionPresentation() {
    const renderState = lastRenderedState;
    if (!renderState) {
      emitGraphContextChange();
      return;
    }

    const graphEditTarget = graphInteractionTargetFromEditTarget(
      renderState.editSession.mode === 'editing' && renderState.editSession.ownerPanel === 'graph'
        ? renderState.editSession.activeTarget
        : null
    );
    if (graphEditTarget && !isSameGraphInteractionTarget(interactionState.selected, graphEditTarget)) {
      interactionState = {
        ...interactionState,
        hovered: null,
        selected: graphEditTarget,
      };
    }

    interactionState = sanitizeGraphInteractionState(interactionState, renderState);
    externalHoverTarget = sanitizeExternalTarget(externalHoverTarget, renderState);
    externalFocusTarget = sanitizeExternalTarget(externalFocusTarget, renderState);
    const displayedNodeValues =
      isAnimationRunning && renderState.flowAnimation
        ? renderState.flowAnimation.fromVector
        : renderState.currentVector;
    const presentation = buildGraphInteractionPresentation(renderState, {
      hovered:
        externalFocusTarget ??
        (focusedGraphEditorInput ? null : externalHoverTarget ?? interactionState.hovered),
      selected: interactionState.selected,
    });
    const shouldAutoCenterForEditing = isInputEditTargetLocked();
    const activeEditTargetKey = interactionTargetKey(presentation.activeTarget);
    if (
      shouldAutoCenterForEditing &&
      presentation.activeTarget &&
      activeEditTargetKey &&
      activeEditTargetKey !== lastAutoCenteredEditTargetKey
    ) {
      ensureActiveEditTargetVisibility({
        activeTarget: presentation.activeTarget,
        highlightedNodeIndices: presentation.highlightedNodeIndices,
        highlightedEdgeKeys: presentation.highlightedEdgeKeys,
      });
      lastAutoCenteredEditTargetKey = activeEditTargetKey;
    } else if (!shouldAutoCenterForEditing) {
      lastAutoCenteredEditTargetKey = null;
    }

    const selectedEdgeEditor = presentation.selectedEdgeEditor
      ? {
          ...presentation.selectedEdgeEditor,
          value: selectDisplayedTransitionCell(
            renderState,
            presentation.selectedEdgeEditor.fromIndex,
            presentation.selectedEdgeEditor.toIndex
          ),
        }
      : null;
    const selectedNodeEditor = presentation.selectedNodeEditor
      ? {
          ...presentation.selectedNodeEditor,
          value: selectDisplayedNodeValue(renderState, presentation.selectedNodeEditor.nodeIndex),
        }
      : null;
    currentHighlightedNodeIndices = new Set(presentation.highlightedNodeIndices);

    currentPathByKey.forEach((path, key) => {
      const baseStyle = currentEdgeBaseStyles.get(key);
      if (!baseStyle) return;

      if (presentation.highlightedEdgeKeys.has(key)) {
        const highlightedMarkerId =
          path.dataset.highlightMarkerId ?? `${EDGE_HIGHLIGHT_MARKER_ID_PREFIX}-fallback`;
        path.style.stroke = EDGE_HIGHLIGHT_STROKE;
        path.style.opacity = baseStyle.opacity.toFixed(3);
        path.style.strokeWidth = baseStyle.strokeWidth.toFixed(3);
        path.setAttribute('marker-end', markerUrl(highlightedMarkerId));
        return;
      }

      const defaultMarkerId =
        path.dataset.defaultMarkerId ?? `${EDGE_DEFAULT_MARKER_ID_PREFIX}-fallback`;
      path.style.stroke = baseStyle.stroke;
      path.style.opacity = baseStyle.opacity.toFixed(3);
      path.style.strokeWidth = baseStyle.strokeWidth.toFixed(3);
      path.setAttribute('marker-end', markerUrl(defaultMarkerId));
    });

    currentNodeCircles.forEach((circle, index) => {
      if (presentation.highlightedNodeIndices.has(index)) {
        circle.style.stroke = NODE_HIGHLIGHT_STROKE;
        circle.style.strokeWidth = String(NODE_HIGHLIGHT_STROKE_WIDTH);
        circle.style.filter = 'drop-shadow(0 0 5px rgba(178, 35, 35, 0.35))';
        const value = displayedNodeValues[index] ?? 0;
        circle.setAttribute('fill', colorForGraphHighlightedNodeValue(value));
        return;
      }
      circle.style.stroke = NODE_DEFAULT_STROKE;
      circle.style.strokeWidth = String(NODE_DEFAULT_STROKE_WIDTH);
      circle.style.filter = 'none';
      if (!isAnimationRunning) {
        const value = renderState.currentVector[index] ?? 0;
        circle.setAttribute('fill', colorForGraphNodeValue(value));
      }
    });

    renderInlineAnnotations({
      state: renderState,
      activeTarget: presentation.activeTarget,
      selectedTarget: presentation.selectedTarget,
      highlightedEdgeKeys: presentation.highlightedEdgeKeys,
      highlightedNodeIndices: presentation.highlightedNodeIndices,
      selectedEdgeEditor,
      selectedNodeEditor,
    });
    applyPendingGraphEditorFocus();

    emitGraphContextChange();
  }

  /**
   * Purpose: Detect when edit-target highlighting should stay locked to an active input target.
   * Inputs: No direct parameters.
   * Returns: `true` when matrix/state/graph inputs or pending graph editor focus are active.
   * Side effects: None (pure computation).
   */
  function isInputEditTargetLocked(): boolean {
    if (focusedGraphEditorInput || pendingGraphEditorFocusTarget) {
      return true;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) {
      return false;
    }
    if (active.dataset.action?.startsWith('graph-set-')) {
      return true;
    }
    return (
      active.classList.contains('markov-number-input--matrix') ||
      active.classList.contains('markov-number-input--state')
    );
  }

  /**
   * Purpose: Convert graph interaction targets into reducer edit targets.
   * Inputs: Graph interaction target.
   * Returns: Matching reducer edit target or `null` when unsupported.
   * Side effects: None (pure computation).
   */
  function toEditTarget(target: GraphInteractionTarget): {
    kind: 'edge';
    fromIndex: number;
    toIndex: number;
  } | {
    kind: 'node';
    index: number;
  } | null {
    if (target.kind === 'edge') {
      return {
        kind: 'edge',
        fromIndex: target.fromIndex,
        toIndex: target.toIndex,
      };
    }
    if (target.kind === 'node') {
      return {
        kind: 'node',
        index: target.nodeIndex,
      };
    }
    return null;
  }

  /**
   * Purpose: Ensure graph inline editor focus is mirrored into reducer edit-session state.
   * Inputs: Graph target and source event hint.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer begin/focus actions for graph-owned editing.
   */
  function dispatchGraphEditFocus(
    target: GraphInteractionTarget,
    source: 'focus' | 'click' | 'tab'
  ) {
    const state = lastRenderedState;
    if (!state) {
      return;
    }
    const editTarget = toEditTarget(target);
    if (!editTarget) {
      return;
    }
    const focusTarget = {
      target,
      armOverwrite: true,
    };
    const session = state.editSession;
    if (session.mode !== 'editing') {
      pendingGraphEditorFocusTarget = focusTarget;
      options.dispatch({
        type: 'EDIT_BEGIN',
        panel: 'graph',
        target: editTarget,
      });
      return;
    }

    if (
      session.ownerPanel === 'graph' &&
      source !== 'click' &&
      ((session.activeTarget?.kind === 'edge' &&
        editTarget.kind === 'edge' &&
        session.activeTarget.fromIndex === editTarget.fromIndex &&
        session.activeTarget.toIndex === editTarget.toIndex) ||
        (session.activeTarget?.kind === 'node' &&
          editTarget.kind === 'node' &&
          session.activeTarget.index === editTarget.index))
    ) {
      return;
    }

    pendingGraphEditorFocusTarget = focusTarget;
    options.dispatch({
      type: 'EDIT_FOCUS_TARGET',
      panel: 'graph',
      target: editTarget,
    });
  }

  /**
   * Purpose: Ensure highlighted objects for the active edit target are fully visible.
   * Inputs: Active target plus highlighted edge/node collections.
   * Returns: No value (`void`).
   * Side effects: Pans or zooms the viewport when highlighted objects are clipped.
   */
  function ensureActiveEditTargetVisibility(config: {
    activeTarget: GraphInteractionTarget;
    highlightedNodeIndices: ReadonlySet<number>;
    highlightedEdgeKeys: ReadonlySet<string>;
  }) {
    if (
      areHighlightedObjectsFullyVisible({
        highlightedNodeIndices: config.highlightedNodeIndices,
        highlightedEdgeKeys: config.highlightedEdgeKeys,
      })
    ) {
      return;
    }

    const bounds =
      computeHighlightedObjectsWorldBounds({
        highlightedNodeIndices: config.highlightedNodeIndices,
        highlightedEdgeKeys: config.highlightedEdgeKeys,
      }) ?? resolveTargetFallbackBounds(config.activeTarget);
    if (!bounds) {
      return;
    }

    const padding = 24;
    const availableWidth = Math.max(1, GRAPH_WIDTH - padding * 2);
    const availableHeight = Math.max(1, GRAPH_HEIGHT - padding * 2);
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const fitScale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
    const nextScale = clamp(Math.min(viewportTransform.scale, fitScale), MIN_GRAPH_SCALE, MAX_GRAPH_SCALE);
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const candidate = normalizeGraphViewportTransform(
      {
        scale: nextScale,
        translateX: GRAPH_WIDTH / 2 - center.x * nextScale,
        translateY: GRAPH_HEIGHT / 2 - center.y * nextScale,
      },
      viewportTransform
    );
    const resolved = normalizeViewportTransformForNodes(candidate);
    applyViewportAfterResolution(candidate, resolved, {
      delayBeforeStart: false,
    });
  }

  /**
   * Purpose: Resolve a world-space center point for node/incoming-node/edge targets.
   * Inputs: Graph interaction target.
   * Returns: Center point for viewport centering or `null` when unavailable.
   * Side effects: None (pure computation).
   */
  function resolveTargetCenter(target: GraphInteractionTarget): Point | null {
    if (target.kind === 'node' || target.kind === 'incoming-node') {
      return currentNodeCenters.get(target.nodeIndex) ?? null;
    }
    if (target.kind !== 'edge') {
      return null;
    }

    const key = edgePathKey(target.fromIndex, target.toIndex);
    const path = currentPathByKey.get(key);
    if (path) {
      try {
        const midpoint = path.getPointAtLength(path.getTotalLength() * 0.5);
        return {
          x: midpoint.x,
          y: midpoint.y,
        };
      } catch {
        // Some browsers can throw for degenerate paths; continue to fallbacks below.
      }
    }

    const labelPoint = currentEdgeLabelPoints.get(key);
    if (labelPoint) {
      return labelPoint;
    }

    const fromCenter = currentNodeCenters.get(target.fromIndex);
    const toCenter = currentNodeCenters.get(target.toIndex);
    if (!fromCenter || !toCenter) {
      return null;
    }
    return {
      x: (fromCenter.x + toCenter.x) / 2,
      y: (fromCenter.y + toCenter.y) / 2,
    };
  }

  /**
   * Purpose: Check whether all highlighted nodes and edges are fully visible.
   * Inputs: Highlighted node-index set and edge-key set.
   * Returns: `true` when every highlighted object is fully inside viewport bounds.
   * Side effects: None (pure computation).
   */
  function areHighlightedObjectsFullyVisible(config: {
    highlightedNodeIndices: ReadonlySet<number>;
    highlightedEdgeKeys: ReadonlySet<string>;
  }): boolean {
    for (const nodeIndex of config.highlightedNodeIndices) {
      const center = currentNodeCenters.get(nodeIndex);
      if (!center || !isNodeFullyVisible(viewportTransform, center)) {
        return false;
      }
    }

    for (const edgeKey of config.highlightedEdgeKeys) {
      const path = currentPathByKey.get(edgeKey);
      if (!path || !isEdgePathFullyVisible(path, viewportTransform)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Purpose: Build world-space bounds covering all highlighted nodes and edges.
   * Inputs: Highlighted node-index set and edge-key set.
   * Returns: Bounding box or `null` when no highlighted geometry is available.
   * Side effects: None (pure computation).
   */
  function computeHighlightedObjectsWorldBounds(config: {
    highlightedNodeIndices: ReadonlySet<number>;
    highlightedEdgeKeys: ReadonlySet<string>;
  }): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includeBounds = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    };

    for (const nodeIndex of config.highlightedNodeIndices) {
      const center = currentNodeCenters.get(nodeIndex);
      if (!center) {
        continue;
      }
      includeBounds({
        minX: center.x - NODE_RADIUS,
        minY: center.y - NODE_RADIUS,
        maxX: center.x + NODE_RADIUS,
        maxY: center.y + NODE_RADIUS,
      });
    }

    for (const edgeKey of config.highlightedEdgeKeys) {
      const path = currentPathByKey.get(edgeKey);
      if (!path) {
        continue;
      }
      const pathBounds = worldBoundsForEdgePath(path);
      if (!pathBounds) {
        continue;
      }
      includeBounds(pathBounds);
    }

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
    };
  }

  /**
   * Purpose: Create fallback bounds from a target center when highlighted geometry is unavailable.
   * Inputs: Active graph interaction target.
   * Returns: World-space bounds centered on the target, or `null`.
   * Side effects: None (pure computation).
   */
  function resolveTargetFallbackBounds(target: GraphInteractionTarget): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    const center = resolveTargetCenter(target);
    if (!center) {
      return null;
    }
    const radius = NODE_RADIUS * 1.2;
    return {
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    };
  }

  /**
   * Purpose: Check if an edge path's rendered bounds are fully visible in viewport coordinates.
   * Inputs: Edge path element and active viewport transform.
   * Returns: `true` when the full rendered edge path is visible.
   * Side effects: None (pure computation).
   */
  function isEdgePathFullyVisible(path: SVGPathElement, transform: GraphViewportTransform): boolean {
    const bounds = worldBoundsForEdgePath(path);
    if (!bounds) {
      return false;
    }
    const minX = bounds.minX * transform.scale + transform.translateX;
    const maxX = bounds.maxX * transform.scale + transform.translateX;
    const minY = bounds.minY * transform.scale + transform.translateY;
    const maxY = bounds.maxY * transform.scale + transform.translateY;
    return minX >= 0 && maxX <= GRAPH_WIDTH && minY >= 0 && maxY <= GRAPH_HEIGHT;
  }

  /**
   * Purpose: Read world-space bounds for an edge path with a small stroke-aware margin.
   * Inputs: Edge path element.
   * Returns: World-space bounds or `null` when unavailable.
   * Side effects: None (pure computation).
   */
  function worldBoundsForEdgePath(path: SVGPathElement): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    try {
      const bbox = path.getBBox();
      const strokeWidth = Number.parseFloat(path.style.strokeWidth || '0');
      const worldMargin = (Number.isFinite(strokeWidth) ? strokeWidth : 0) * 0.6 + 2;
      return {
        minX: bbox.x - worldMargin,
        minY: bbox.y - worldMargin,
        maxX: bbox.x + bbox.width + worldMargin,
        maxY: bbox.y + bbox.height + worldMargin,
      };
    } catch {
      return null;
    }
  }

  /**
   * Purpose: Determine whether the graph panel owns an active edit session.
   * Inputs: No direct parameters.
   * Returns: `true` when edit mode is active and owned by the graph panel.
   * Side effects: None (pure computation).
   */
  function isGraphEditingSessionActive(): boolean {
    const session = lastRenderedState?.editSession;
    return session?.mode === 'editing' && session.ownerPanel === 'graph';
  }

  /**
   * Purpose: Determine whether graph-owned edit drafts are pending commit.
   * Inputs: No direct parameters.
   * Returns: `true` when graph-owned edge/node draft buffers are non-empty.
   * Side effects: None (pure computation).
   */
  function hasPendingGraphDrafts(): boolean {
    const state = lastRenderedState;
    if (!state || !isGraphEditingSessionActive()) {
      return false;
    }
    const drafts = state.editSession.drafts;
    return (
      Object.keys(drafts.edgeByKey).length > 0 || Object.keys(drafts.nodeByIndex).length > 0
    );
  }

  /**
   * Purpose: Cancel graph-owned staged edits and restore snapshot values.
   * Inputs: Optional cancellation reason.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer cancellation action.
   */
  function discardGraphDrafts(reason: 'escape' | 'outside_click' = 'outside_click') {
    if (!isGraphEditingSessionActive()) {
      return;
    }
    options.dispatch({
      type: 'EDIT_CANCEL',
      reason,
    });
  }

  /**
   * Purpose: Handle keyboard editing commands for graph inline editors.
   * Inputs: Keyboard event and active inline editor input.
   * Returns: `true` when the key was handled.
   * Side effects: Updates drafts, focus target, and commit/cancel behavior.
   */
  function handleGraphEditorInputKeyDown(
    event: KeyboardEvent,
    target: HTMLInputElement
  ): boolean {
    if (overwriteArmedGraphEditorInput === target && shouldUseDestructiveOverwrite(event)) {
      target.value = '';
      overwriteArmedGraphEditorInput = null;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      stageGraphEditorDraftFromInput(target, {
        commitOnTrailingDecimal: true,
      });
      const currentTarget = readGraphEditorTarget(target);
      if (!currentTarget) {
        armGraphEditorForDestructiveOverwrite(target);
        return true;
      }
      const nextTarget = resolveNextGraphEditorTarget(currentTarget, event.shiftKey);
      if (!nextTarget) {
        armGraphEditorForDestructiveOverwrite(target);
        return true;
      }
      interactionState = {
        ...interactionState,
        hovered: null,
        selected: nextTarget,
      };
      dispatchGraphEditFocus(nextTarget, 'tab');
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeActiveGraphEditor();
      discardGraphDrafts('escape');
      return true;
    }

    if (event.key !== 'Enter') {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    stageGraphEditorDraftFromInput(target, {
      commitOnTrailingDecimal: true,
    });
    closeActiveGraphEditor();
    commitGraphDraftsAndNormalize('enter');
    return true;
  }

  /**
   * Purpose: Close the currently active graph inline editor and clear selection-backed editor UI.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Clears pending graph editor focus, blurs focused input, and removes selected target.
   */
  function closeActiveGraphEditor() {
    pendingGraphEditorFocusTarget = null;
    overwriteArmedGraphEditorInput = null;
    if (focusedGraphEditorInput && focusedGraphEditorInput.isConnected) {
      focusedGraphEditorInput.blur();
    }
    focusedGraphEditorInput = null;
    if (interactionState.selected) {
      interactionState = {
        ...interactionState,
        selected: null,
      };
    }
  }

  /**
   * Purpose: Stage an edge/node draft from the currently focused graph editor input.
   * Inputs: Graph inline input element.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer draft updates.
   */
  function stageGraphEditorDraftFromInput(
    input: HTMLInputElement,
    config: {
      preserveFocus?: boolean;
      commitOnTrailingDecimal?: boolean;
    } = {}
  ) {
    const graphTarget = readGraphEditorTarget(input);
    if (!graphTarget) {
      return;
    }
    const draft = readNonNegativeDraftInputValue(input, {
      deferTrailingDecimal: !(config.commitOnTrailingDecimal ?? false),
      deferZeroOnlyFraction: !(config.commitOnTrailingDecimal ?? false),
    });
    if (!draft.shouldDispatch || draft.value === null) {
      return;
    }
    const editTarget = toEditTarget(graphTarget);
    if (!editTarget) {
      return;
    }
    if (config.preserveFocus) {
      pendingGraphEditorFocusTarget = {
        target: graphTarget,
        armOverwrite: false,
      };
    }
    options.dispatch({
      type: 'EDIT_CHANGE_VALUE',
      target: editTarget,
      value: draft.value,
    });
  }

  /**
   * Purpose: Commit graph-owned staged edits via reducer-backed normalized actions.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer commit action.
   */
  function commitGraphDraftsAndNormalize(reason: 'enter' | 'normalize_button') {
    if (!isGraphEditingSessionActive()) {
      return;
    }
    options.dispatch({
      type: 'EDIT_COMMIT',
      reason,
    });
  }

  /**
   * Purpose: Resolve the interaction target represented by a graph inline editor input.
   * Inputs: Graph inline input element.
   * Returns: Graph interaction target or `null` when unrecognized.
   * Side effects: None (pure computation).
   */
  function readGraphEditorTarget(input: HTMLInputElement): GraphInteractionTarget | null {
    const action = input.dataset.action;
    if (action === 'graph-set-edge-weight') {
      const fromIndex = Number.parseInt(input.dataset.fromIndex ?? '', 10);
      const toIndex = Number.parseInt(input.dataset.toIndex ?? '', 10);
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
        return null;
      }
      return {
        kind: 'edge',
        fromIndex,
        toIndex,
      };
    }

    if (action === 'graph-set-node-value') {
      const nodeIndex = Number.parseInt(input.dataset.nodeIndex ?? '', 10);
      if (!Number.isInteger(nodeIndex)) {
        return null;
      }
      return {
        kind: 'node',
        nodeIndex,
      };
    }

    return null;
  }

  /**
   * Purpose: Resolve the next graph editor target when cycling with the tab key.
   * Inputs: Current target and reverse-cycle flag.
   * Returns: Next target in cyclic traversal order, or `null`.
   * Side effects: None (pure computation).
   */
  function resolveNextGraphEditorTarget(
    currentTarget: GraphInteractionTarget,
    reverse: boolean
  ): GraphInteractionTarget | null {
    const orderedNodes = resolveOrderedGraphNodeIndices();
    const orderedEdges = resolveOrderedGraphEdgeTargets();

    if (currentTarget.kind === 'node') {
      const nodePosition = orderedNodes.indexOf(currentTarget.nodeIndex);
      if (nodePosition < 0) {
        return orderedNodes.length > 0
          ? { kind: 'node', nodeIndex: orderedNodes[0] }
          : orderedEdges[0] ?? null;
      }

      if (!reverse) {
        if (nodePosition < orderedNodes.length - 1) {
          return {
            kind: 'node',
            nodeIndex: orderedNodes[nodePosition + 1],
          };
        }
        return orderedEdges[0] ?? { kind: 'node', nodeIndex: orderedNodes[0] };
      }

      if (nodePosition > 0) {
        return {
          kind: 'node',
          nodeIndex: orderedNodes[nodePosition - 1],
        };
      }
      return orderedEdges[orderedEdges.length - 1] ?? {
        kind: 'node',
        nodeIndex: orderedNodes[orderedNodes.length - 1],
      };
    }

    if (currentTarget.kind === 'edge') {
      const edgePosition = orderedEdges.findIndex(
        (edge) =>
          edge.fromIndex === currentTarget.fromIndex && edge.toIndex === currentTarget.toIndex
      );
      if (edgePosition < 0) {
        return orderedEdges[0] ?? (orderedNodes.length > 0 ? { kind: 'node', nodeIndex: orderedNodes[0] } : null);
      }

      if (!reverse) {
        if (edgePosition < orderedEdges.length - 1) {
          return orderedEdges[edgePosition + 1];
        }
        return orderedNodes.length > 0
          ? { kind: 'node', nodeIndex: orderedNodes[0] }
          : orderedEdges[0];
      }

      if (edgePosition > 0) {
        return orderedEdges[edgePosition - 1];
      }
      return orderedNodes.length > 0
        ? { kind: 'node', nodeIndex: orderedNodes[orderedNodes.length - 1] }
        : orderedEdges[orderedEdges.length - 1];
    }

    return null;
  }

  /**
   * Purpose: Build ordered node traversal indices for graph inline editors.
   * Inputs: No direct parameters.
   * Returns: Sorted node-index list for editor focus traversal.
   * Side effects: None (pure computation).
   */
  function resolveOrderedGraphNodeIndices(): number[] {
    if (lastGraphData?.nodeIndices && lastGraphData.nodeIndices.length > 0) {
      return [...lastGraphData.nodeIndices];
    }
    return [...currentNodeCenters.keys()].sort((left, right) => left - right);
  }

  /**
   * Purpose: Build ordered edge traversal targets for graph inline editors.
   * Inputs: No direct parameters.
   * Returns: Edge-target list for editor focus traversal.
   * Side effects: None (pure computation).
   */
  function resolveOrderedGraphEdgeTargets(): Array<{
    kind: 'edge';
    fromIndex: number;
    toIndex: number;
  }> {
    return [...currentPathByKey.keys()]
      .sort((left, right) => left.localeCompare(right))
      .map((key) => parseEdgeKey(key))
      .filter(
        (
          parsed
        ): parsed is {
          fromIndex: number;
          toIndex: number;
        } => Boolean(parsed)
      )
      .map((parsed) => ({
        kind: 'edge' as const,
        fromIndex: parsed.fromIndex,
        toIndex: parsed.toIndex,
      }));
  }

  /**
   * Purpose: Focus a pending graph editor target after annotation rerenders.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Focuses graph inline editor inputs when available.
   */
  function applyPendingGraphEditorFocus() {
    if (!pendingGraphEditorFocusTarget) {
      return;
    }
    const pending = pendingGraphEditorFocusTarget;
    const pendingTarget = pending.target;

    let selector = '';
    if (pendingTarget.kind === 'node') {
      selector = `input[data-action="graph-set-node-value"][data-node-index="${pendingTarget.nodeIndex}"]`;
    } else if (pendingTarget.kind === 'edge') {
      selector = `input[data-action="graph-set-edge-weight"][data-from-index="${pendingTarget.fromIndex}"][data-to-index="${pendingTarget.toIndex}"]`;
    }
    if (!selector) {
      pendingGraphEditorFocusTarget = null;
      return;
    }

    const input = annotationLayer.querySelector<HTMLInputElement>(selector);
    if (!input) {
      return;
    }
    pendingGraphEditorFocusTarget = null;
    input.focus({ preventScroll: true });
    focusedGraphEditorInput = input;
    input.classList.add('markov-input-caret-red');
    input.classList.remove('markov-input-caret-blue');
    if (pending.armOverwrite) {
      armGraphEditorForDestructiveOverwrite(input);
    } else {
      overwriteArmedGraphEditorInput = null;
      moveCaretToEnd(input);
    }
  }

  /**
   * Purpose: Arm focused graph editors so the next printable key overwrites the value.
   * Inputs: Graph inline editor input.
   * Returns: No value (`void`).
   * Side effects: Enables overwrite-on-next-key behavior and selects current input text.
   */
  function armGraphEditorForDestructiveOverwrite(input: HTMLInputElement) {
    overwriteArmedGraphEditorInput = input;
    input.classList.add('markov-input-caret-red');
    input.classList.remove('markov-input-caret-blue');
    try {
      input.select();
    } catch {
      // Number inputs may ignore text selection in some browsers.
    }
  }

  /**
   * Purpose: Switch a focused graph inline editor to insert mode.
   * Inputs: Active graph input element.
   * Returns: No value (`void`).
   * Side effects: Clears overwrite arming, updates caret class, and collapses selection.
   */
  function disarmGraphEditorForInsertMode(input: HTMLInputElement) {
    overwriteArmedGraphEditorInput = null;
    input.classList.remove('markov-input-caret-red');
    input.classList.add('markov-input-caret-blue');
    try {
      const caret = input.selectionEnd ?? input.selectionStart ?? input.value.length;
      input.setSelectionRange(caret, caret);
    } catch {
      // Ignore browsers that disallow selection control for this input type.
    }
  }

  /**
   * Purpose: Emit graph viewport/interaction context updates for matrix/state panel coordination.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Invokes external callback when the emitted context changes.
   */
  function emitGraphContextChange() {
    if (!hasRenderedAtLeastOnce) {
      return;
    }
    if (!options.onContextChange) {
      return;
    }

    const renderState = lastRenderedState;
    const sanitizedHovered = renderState
      ? sanitizeExternalTarget(
          externalFocusTarget ??
            (focusedGraphEditorInput ? null : externalHoverTarget ?? interactionState.hovered),
          renderState
        )
      : null;
    const sanitizedSelected = renderState
      ? sanitizeExternalTarget(interactionState.selected, renderState)
      : null;
    const nextContext: GraphPanelContextSnapshot = {
      renderedNodeIndices: [
        ...(lastGraphData?.nodeIndices ??
          (renderState ? Array.from({ length: renderState.nodeCount }, (_, index) => index) : [])),
      ],
      viewportVisibleNodeIndices: computeViewportVisibleNodeIndices(
        viewportTransform,
        currentNodeCenters
      ),
      activeTarget: sanitizedHovered ?? sanitizedSelected,
      selectedTarget: sanitizedSelected,
    };

    if (isSameGraphPanelContext(lastEmittedContext, nextContext)) {
      return;
    }

    lastEmittedContext = nextContext;
    options.onContextChange(nextContext);
  }

  /**
   * Purpose: Reset zoom/pan transform back to the canonical default viewport.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Clears status text, updates viewport state, and reapplies SVG transform.
   */
  function resetViewportToDefault() {
    cancelViewportProjectionAnimation();
    clearGraphStatus();
    viewportTransform = normalizeViewportTransformForNodes(createDefaultGraphViewportTransform());
    applyViewportTransformImmediate(viewportTransform);
  }

  /**
   * Purpose: Render on-graph value labels and inline editors for selected nodes/edges.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function renderInlineAnnotations(config: {
    state: AppState;
    activeTarget: GraphInteractionTarget | null;
    selectedTarget: GraphInteractionTarget | null;
    highlightedEdgeKeys: ReadonlySet<string>;
    highlightedNodeIndices: ReadonlySet<number>;
    selectedEdgeEditor: { fromIndex: number; toIndex: number; value: number } | null;
    selectedNodeEditor: { nodeIndex: number; value: number } | null;
  }) {
    annotationLayer.replaceChildren();

    const edgeKeysToShow = new Set<string>();
    const nodesToShow = new Set<number>();
    const occupiedRects: Rect[] = [];
    const nodeObstacles: CircleObstacle[] = Array.from(currentNodeCenters.values()).map(
      (center) => ({
        x: center.x,
        y: center.y,
        radius: NODE_RADIUS + 7,
      })
    );

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
      edgeKeysToShow.add(
        edgePathKey(config.selectedTarget.fromIndex, config.selectedTarget.toIndex)
      );
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
      const labelWidth = estimateLabelWidth(text, 'edge') + VALUE_LABEL_CELL_PADDING_X * 2;
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
        isHighlighted: config.highlightedEdgeKeys.has(key),
      });
      occupiedRects.push(rect);
      annotationLayer.appendChild(label);
    });

    nodesToShow.forEach((nodeIndex) => {
      const center = currentNodeCenters.get(nodeIndex);
      if (!center) return;
      const value = config.state.currentVector[nodeIndex] ?? 0;
      const valueText = formatProbability(value, 3);
      const nodeHoverLabel = resolveHoveredDatasetNodeLabel({
        state: config.state,
        nodeIndex,
        activeTarget: config.activeTarget,
        selectedTarget: config.selectedTarget,
      });
      const datasetHoverText = nodeHoverLabel;
      const displayText = datasetHoverText ? `${valueText} · ${datasetHoverText}` : valueText;
      const text = `N${nodeIndex + 1}=${displayText}`;
      const labelWidth = estimateLabelWidth(text, 'node') + VALUE_LABEL_CELL_PADDING_X * 2;
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
        text: displayText,
        kind: 'node',
        nodeIndex,
        isHighlighted: config.highlightedNodeIndices.has(nodeIndex),
      });
      occupiedRects.push(rect);
      annotationLayer.appendChild(label);
    });

    if (config.selectedEdgeEditor) {
      const key = edgePathKey(
        config.selectedEdgeEditor.fromIndex,
        config.selectedEdgeEditor.toIndex
      );
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
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                data-action="graph-set-edge-weight"
                data-from-index="${config.selectedEdgeEditor.fromIndex}"
                data-to-index="${config.selectedEdgeEditor.toIndex}"
                value="${formatEditableInputValue(config.selectedEdgeEditor.value)}"
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
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                data-action="graph-set-node-value"
                data-node-index="${config.selectedNodeEditor.nodeIndex}"
                value="${formatEditableInputValue(config.selectedNodeEditor.value)}"
              />
            `,
          })
        );
        occupiedRects.push(rect);
      }
    }

  }

  /**
   * Purpose: Return a dataset-provided node label for hovered/selected node annotations.
   * Inputs: Current state, node index, and interaction targets.
   * Returns: Label text when active, otherwise `null`.
   * Side effects: None (pure computation).
   */
  function resolveHoveredDatasetNodeLabel(config: {
    state: AppState;
    nodeIndex: number;
    activeTarget: GraphInteractionTarget | null;
    selectedTarget: GraphInteractionTarget | null;
  }): string | null {
    if (config.state.sourceMode !== 'dataset') {
      return null;
    }
    const isActiveNode =
      (config.activeTarget?.kind === 'node' && config.activeTarget.nodeIndex === config.nodeIndex) ||
      (config.selectedTarget?.kind === 'node' &&
        config.selectedTarget.nodeIndex === config.nodeIndex);
    if (!isActiveNode) {
      return null;
    }
    const label = config.state.dataset.activeNodeLabels[config.nodeIndex];
    if (typeof label !== 'string') {
      return null;
    }
    const normalized = label.trim();
    return normalized.length > 0 ? normalized : null;
  }

  /**
   * Purpose: Create a positioned SVG value label for node or edge probability text.
   * Inputs: Label rectangle, text payload, label kind, and optional node/highlight metadata.
   * Returns: A fully configured SVG group containing the value-cell background and label text.
   * Side effects: Creates detached SVG elements.
   */
  function createValueLabel(config: {
    rect: Rect;
    text: string;
    kind: 'edge' | 'node';
    nodeIndex?: number;
    isHighlighted?: boolean;
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
    if (config.isHighlighted) {
      label.classList.add('markov-graph-value-label--highlighted');
    }
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

  /**
   * Purpose: Create and position an inline numeric editor near the selected graph target.
   * Inputs: Target rectangle coordinates/dimensions and the inline input markup.
   * Returns: An SVG `foreignObject` wrapping the inline editor content.
   * Side effects: Creates detached DOM/SVG nodes.
   */
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

  /**
   * Purpose: Sync the toggle-all-values control text and pressed state.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Updates toggle button text and `aria-pressed` state.
   */
  function updateToggleAllValuesButton() {
    toggleAllValuesButton.textContent = showAllValues ? 'Hide all values' : 'Show all values';
    toggleAllValuesButton.setAttribute('aria-pressed', showAllValues ? 'true' : 'false');
  }

  /**
   * Keep dataset selector options synchronized with backend catalog metadata.
   */
  function syncDatasetSelectOptions(state: AppState) {
    const availableDatasets = state.dataset.availableDatasets;
    if (availableDatasets.length <= 0) {
      return;
    }

    const existingById = new Map<string, HTMLOptionElement>();
    Array.from(datasetSelect.options).forEach((option) => {
      existingById.set(option.value, option);
    });

    availableDatasets.forEach((dataset) => {
      const existing = existingById.get(dataset.id);
      if (existing) {
        existing.textContent = dataset.label;
        return;
      }
      const option = document.createElement('option');
      option.value = dataset.id;
      option.textContent = dataset.label;
      datasetSelect.appendChild(option);
    });
  }

  /**
   * Keep dataset preset selector options synchronized with backend catalog metadata.
   */
  function syncPresetSelectOptions(state: AppState) {
    const availablePresets = state.dataset.availablePresets;
    if (availablePresets.length <= 0) {
      return;
    }
    const existingById = new Map<string, HTMLOptionElement>();
    Array.from(datasetPresetSelect.options).forEach((option) => {
      existingById.set(option.value, option);
    });

    availablePresets.forEach((preset) => {
      const existing = existingById.get(preset.id);
      if (existing) {
        existing.textContent = preset.label;
        return;
      }
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      datasetPresetSelect.appendChild(option);
    });
  }

  /**
   * Purpose: Apply normalized viewport transforms after visible-node constraints are resolved.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function applyViewportAfterResolution(
    requested: GraphViewportTransform,
    resolved: GraphViewportTransform,
    options?: {
      delayBeforeStart?: boolean;
    }
  ) {
    if (isSameViewportTransform(requested, resolved)) {
      applyViewportTransformImmediate(resolved);
      return;
    }

    animateViewportProjectionTo(resolved, options?.delayBeforeStart ?? false);
  }

  /**
   * Purpose: Apply a viewport transform immediately to the SVG viewport group.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function applyViewportTransformImmediate(next: GraphViewportTransform) {
    viewportTransform = next;
    viewportLayer.setAttribute('transform', toSvgViewportTransform(viewportTransform));
    emitGraphContextChange();
  }

  /**
   * Purpose: Cancel any in-flight viewport projection tween.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function cancelViewportProjectionAnimation() {
    if (viewportProjectionStartTimeoutId !== null) {
      window.clearTimeout(viewportProjectionStartTimeoutId);
      viewportProjectionStartTimeoutId = null;
    }
    if (viewportProjectionAnimationHandle !== null) {
      cancelAnimationFrame(viewportProjectionAnimationHandle);
      viewportProjectionAnimationHandle = null;
    }
    viewportProjectionAnimationToken += 1;
    viewportProjectionTarget = null;
  }

  /**
   * Purpose: Animate viewport transform to a projected target transform.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function animateViewportProjectionTo(target: GraphViewportTransform, delayBeforeStart: boolean) {
    if (reduceMotionQuery.matches) {
      cancelViewportProjectionAnimation();
      applyViewportTransformImmediate(target);
      return;
    }

    if (isSameViewportTransform(viewportTransform, target)) {
      applyViewportTransformImmediate(target);
      return;
    }

    if (viewportProjectionTarget && isSameViewportTransform(viewportProjectionTarget, target)) {
      return;
    }

    if (
      delayBeforeStart &&
      (viewportProjectionStartTimeoutId !== null || viewportProjectionAnimationHandle !== null)
    ) {
      // Keep an in-flight delayed/running projection while user continues panning; just retarget.
      viewportProjectionTarget = target;
      return;
    }

    cancelViewportProjectionAnimation();
    viewportProjectionTarget = target;
    const token = viewportProjectionAnimationToken;
    const startTween = () => {
      if (token !== viewportProjectionAnimationToken) {
        return;
      }

      viewportProjectionStartTimeoutId = null;
      const resolvedTarget = viewportProjectionTarget ?? target;
      const start = { ...viewportTransform };
      const startTime = performance.now();

      const renderFrame = (now: number) => {
        if (token !== viewportProjectionAnimationToken) {
          return;
        }

        const elapsed = now - startTime;
        const progress = clamp01(elapsed / PROJECTION_ANIMATION_DURATION_MS);
        const eased = easeInOutCubic(progress);
        const activeTarget = viewportProjectionTarget ?? resolvedTarget;
        const next = {
          scale: lerp(start.scale, activeTarget.scale, eased),
          translateX: lerp(start.translateX, activeTarget.translateX, eased),
          translateY: lerp(start.translateY, activeTarget.translateY, eased),
        };
        applyViewportTransformImmediate(next);

        if (progress < 1) {
          viewportProjectionAnimationHandle = requestAnimationFrame(renderFrame);
          return;
        }

        viewportProjectionAnimationHandle = null;
        const finalTarget = viewportProjectionTarget ?? resolvedTarget;
        viewportProjectionTarget = null;
        applyViewportTransformImmediate(finalTarget);
      };

      viewportProjectionAnimationHandle = requestAnimationFrame(renderFrame);
    };

    if (!delayBeforeStart) {
      startTween();
      return;
    }

    viewportProjectionStartTimeoutId = window.setTimeout(startTween, PAN_PROJECTION_START_DELAY_MS);
  }

  /**
   * Purpose: Filter key events that should not trigger graph viewport actions.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function shouldIgnoreGraphKeyEvent(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }
    return false;
  }

  /**
   * Purpose: Zoom the graph viewport around a focal point while preserving visible-node constraints.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function zoomViewport(zoomFactor: number, focalPoint: Point) {
    if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
      return;
    }

    const nextScale = clamp(viewportTransform.scale * zoomFactor, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE);
    if (Math.abs(nextScale - viewportTransform.scale) <= PROBABILITY_EPSILON) {
      return;
    }

    const worldX = (focalPoint.x - viewportTransform.translateX) / viewportTransform.scale;
    const worldY = (focalPoint.y - viewportTransform.translateY) / viewportTransform.scale;
    const candidate = normalizeGraphViewportTransform(
      {
        scale: nextScale,
        translateX: focalPoint.x - nextScale * worldX,
        translateY: focalPoint.y - nextScale * worldY,
      },
      viewportTransform
    );
    const resolved = normalizeViewportTransformForNodes(candidate);
    applyViewportAfterResolution(candidate, resolved, {
      delayBeforeStart: false,
    });
  }

  /**
   * Purpose: Pan the graph viewport in a direction while enforcing visibility constraints.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function panViewport(delta: Point, direction: PanDirection) {
    if (
      !Number.isFinite(delta.x) ||
      !Number.isFinite(delta.y) ||
      (Math.abs(delta.x) <= PROBABILITY_EPSILON && Math.abs(delta.y) <= PROBABILITY_EPSILON)
    ) {
      return;
    }

    const candidate = normalizeGraphViewportTransform(
      {
        translateX: viewportTransform.translateX + delta.x,
        translateY: viewportTransform.translateY + delta.y,
      },
      viewportTransform
    );

    if (currentNodeCenters.size === 0) {
      cancelViewportProjectionAnimation();
      viewportTransform = clampViewportScaleBounds(candidate);
      applyViewportTransformImmediate(viewportTransform);
      return;
    }

    if (hasAnyFullyVisibleNode(candidate, currentNodeCenters.values())) {
      cancelViewportProjectionAnimation();
      clearGraphStatus();
      viewportTransform = clampViewportScaleBounds(candidate);
      applyViewportTransformImmediate(viewportTransform);
      return;
    }

    const current = viewportTransform;
    const constrained = projectPanToVisibleNodeInDirection(current, candidate, direction);

    if (
      isSameViewportTransform(constrained, current) &&
      !hasAnyFullyVisibleNode(candidate, currentNodeCenters.values())
    ) {
      cancelViewportProjectionAnimation();
      showPanBlockedStatus(direction);
    } else {
      clearGraphStatus();
      applyViewportAfterResolution(candidate, constrained, {
        // Delay only when user keeps panning into the visibility boundary.
        delayBeforeStart: true,
      });
    }
  }

  /**
   * Purpose: Update viewport panning while drag interaction is active.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function handlePanDragMove(event: PointerEvent) {
    if (!isPanDragging || panPointerId === null || event.pointerId !== panPointerId) {
      return;
    }

    if (!lastPanClientPoint) {
      lastPanClientPoint = {
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }

    const clientDeltaX = event.clientX - lastPanClientPoint.x;
    const clientDeltaY = event.clientY - lastPanClientPoint.y;
    lastPanClientPoint = {
      x: event.clientX,
      y: event.clientY,
    };

    const rect = graphSvg.getBoundingClientRect();
    const graphDelta = {
      x: (clientDeltaX / Math.max(1, rect.width)) * GRAPH_WIDTH,
      y: (clientDeltaY / Math.max(1, rect.height)) * GRAPH_HEIGHT,
    };
    const direction = inferPanDirection(graphDelta);
    if (!direction) {
      return;
    }
    panViewport(graphDelta, direction);
    didPanDuringDrag = true;
  }

  /**
   * Purpose: Finalize drag-pan interaction and release pointer capture.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function finishPanDrag(pointerId: number) {
    if (!isPanDragging || panPointerId === null || pointerId !== panPointerId) {
      return;
    }
    isPanDragging = false;
    panPointerId = null;
    lastPanClientPoint = null;
    cancelViewportProjectionAnimation();
  }

  /**
   * Purpose: Infer dominant pan direction from drag delta.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function inferPanDirection(delta: Point): PanDirection | null {
    if (Math.abs(delta.x) <= PROBABILITY_EPSILON && Math.abs(delta.y) <= PROBABILITY_EPSILON) {
      return null;
    }
    if (Math.abs(delta.x) >= Math.abs(delta.y)) {
      return delta.x >= 0 ? 'right' : 'left';
    }
    return delta.y >= 0 ? 'down' : 'up';
  }

  /**
   * Purpose: Normalize transforms so at least one node remains fully visible when possible.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function normalizeViewportTransformForNodes(
    transform: GraphViewportTransform
  ): GraphViewportTransform {
    const clampedScale = clampViewportScaleBounds(transform);
    if (currentNodeCenters.size === 0) {
      return clampedScale;
    }
    if (hasAnyFullyVisibleNode(clampedScale, currentNodeCenters.values())) {
      return clampedScale;
    }
    return projectTransformToNearestVisibleNode(clampedScale, currentNodeCenters.values());
  }

  /**
   * Purpose: Clamp viewport scale to configured min/max bounds.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function clampViewportScaleBounds(transform: GraphViewportTransform): GraphViewportTransform {
    return {
      ...transform,
      scale: clamp(transform.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE),
    };
  }

  /**
   * Purpose: Project a directional pan toward the nearest transform with a visible node.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function projectPanToVisibleNodeInDirection(
    current: GraphViewportTransform,
    requested: GraphViewportTransform,
    direction: PanDirection
  ): GraphViewportTransform {
    let best: GraphViewportTransform | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestAxisProgress = Number.NEGATIVE_INFINITY;

    for (const center of currentNodeCenters.values()) {
      const candidate = projectTransformToVisibleNodeForCenter(requested, center);
      if (!candidate) {
        continue;
      }
      if (!hasPanProgressInDirection(current, candidate, direction)) {
        continue;
      }

      const axisProgress = panAxisProgress(current, candidate, direction);
      const distance = Math.hypot(
        candidate.translateX - requested.translateX,
        candidate.translateY - requested.translateY
      );
      const hasBetterDistance =
        distance < bestDistance - 1e-6 ||
        (Math.abs(distance - bestDistance) <= 1e-6 && axisProgress > bestAxisProgress + 1e-6);
      if (hasBetterDistance) {
        bestDistance = distance;
        bestAxisProgress = axisProgress;
        best = candidate;
      }
    }

    return best ?? current;
  }

  /**
   * Purpose: Project transform toward center-preserving visible-node placement.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function projectTransformToVisibleNodeForCenter(
    transform: GraphViewportTransform,
    center: Point
  ): GraphViewportTransform | null {
    const scale = transform.scale;
    const radius = NODE_RADIUS * scale;
    const txMin = radius - center.x * scale;
    const txMax = GRAPH_WIDTH - radius - center.x * scale;
    const tyMin = radius - center.y * scale;
    const tyMax = GRAPH_HEIGHT - radius - center.y * scale;
    if (txMin > txMax || tyMin > tyMax) {
      return null;
    }

    return {
      scale,
      translateX: clamp(transform.translateX, txMin, txMax),
      translateY: clamp(transform.translateY, tyMin, tyMax),
    };
  }

  /**
   * Purpose: Measure signed progress along one pan axis for direction checks.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function panAxisProgress(
    current: GraphViewportTransform,
    next: GraphViewportTransform,
    direction: PanDirection
  ): number {
    if (direction === 'left') {
      return current.translateX - next.translateX;
    }
    if (direction === 'right') {
      return next.translateX - current.translateX;
    }
    if (direction === 'up') {
      return current.translateY - next.translateY;
    }
    return next.translateY - current.translateY;
  }

  /**
   * Purpose: Check whether a projected transform progresses in the requested pan direction.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: Boolean condition result.
   * Side effects: None (pure computation).
   */
  function hasPanProgressInDirection(
    current: GraphViewportTransform,
    next: GraphViewportTransform,
    direction: PanDirection
  ): boolean {
    return panAxisProgress(current, next, direction) > PROBABILITY_EPSILON;
  }

  /**
   * Purpose: Check whether any graph node is fully visible under a transform.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: Boolean condition result.
   * Side effects: None (pure computation).
   */
  function hasAnyFullyVisibleNode(
    transform: GraphViewportTransform,
    centers: Iterable<Point>
  ): boolean {
    for (const center of centers) {
      if (isNodeFullyVisible(transform, center)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Purpose: Check whether a node center and radius are fully within viewport bounds.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: Boolean condition result.
   * Side effects: None (pure computation).
   */
  function isNodeFullyVisible(transform: GraphViewportTransform, center: Point): boolean {
    const radius = NODE_RADIUS * transform.scale;
    const screenX = transform.translateX + center.x * transform.scale;
    const screenY = transform.translateY + center.y * transform.scale;
    return (
      screenX - radius >= 0 &&
      screenX + radius <= GRAPH_WIDTH &&
      screenY - radius >= 0 &&
      screenY + radius <= GRAPH_HEIGHT
    );
  }

  /**
   * Purpose: Search for the nearest transform that keeps at least one node visible.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function projectTransformToNearestVisibleNode(
    transform: GraphViewportTransform,
    centers: Iterable<Point>
  ): GraphViewportTransform {
    const scale = transform.scale;
    const radius = NODE_RADIUS * scale;
    let best: GraphViewportTransform | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const center of centers) {
      const txMin = radius - center.x * scale;
      const txMax = GRAPH_WIDTH - radius - center.x * scale;
      const tyMin = radius - center.y * scale;
      const tyMax = GRAPH_HEIGHT - radius - center.y * scale;
      if (txMin > txMax || tyMin > tyMax) {
        continue;
      }

      const candidate = {
        scale,
        translateX: clamp(transform.translateX, txMin, txMax),
        translateY: clamp(transform.translateY, tyMin, tyMax),
      };
      const distance = Math.hypot(
        candidate.translateX - transform.translateX,
        candidate.translateY - transform.translateY
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }

    return best ?? transform;
  }

  /**
   * Purpose: Show transient status feedback when panning cannot progress further.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function showPanBlockedStatus(direction: PanDirection) {
    if (graphStatusTimeoutId !== null) {
      window.clearTimeout(graphStatusTimeoutId);
      graphStatusTimeoutId = null;
    }
    graphStatus.textContent = `No node further ${toViewportPanDirection(direction)}.`;
    graphStatusTimeoutId = window.setTimeout(() => {
      graphStatusTimeoutId = null;
      graphStatus.textContent = '';
    }, PAN_BLOCKED_NOTICE_MS);
  }

  /**
   * Purpose: Map local pan direction names to viewport utility direction strings.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function toViewportPanDirection(direction: PanDirection): string {
    if (direction === 'left') return 'to the right';
    if (direction === 'right') return 'to the left';
    if (direction === 'up') return 'downward';
    return 'upward';
  }

  /**
   * Purpose: Clear transient graph status text.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function setGraphStatus(
    message: string,
    options?: {
      sticky?: boolean;
    }
  ) {
    if (graphStatusTimeoutId !== null) {
      window.clearTimeout(graphStatusTimeoutId);
      graphStatusTimeoutId = null;
    }
    graphStatus.textContent = message;
    if (!options?.sticky) {
      graphStatusTimeoutId = window.setTimeout(() => {
        graphStatusTimeoutId = null;
        graphStatus.textContent = '';
      }, PAN_BLOCKED_NOTICE_MS * 2);
    }
  }

  /**
   * Purpose: Clear transient graph status text.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function clearGraphStatus() {
    if (graphStatusTimeoutId !== null) {
      window.clearTimeout(graphStatusTimeoutId);
      graphStatusTimeoutId = null;
    }
    graphStatus.textContent = '';
  }

  /**
   * Purpose: Compare viewport transforms with epsilon tolerance.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: Boolean condition result.
   * Side effects: None (pure computation).
   */
  function isSameViewportTransform(
    left: GraphViewportTransform,
    right: GraphViewportTransform
  ): boolean {
    return (
      Math.abs(left.scale - right.scale) <= 1e-9 &&
      Math.abs(left.translateX - right.translateX) <= 1e-6 &&
      Math.abs(left.translateY - right.translateY) <= 1e-6
    );
  }

  /**
   * Purpose: Estimate annotation label width from text length and label kind.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function estimateLabelWidth(text: string, kind: 'edge' | 'node'): number {
    const base = kind === 'edge' ? 38 : 52;
    return Math.max(base, text.length * 6.8 + 10);
  }

  /**
   * Purpose: Choose a candidate rectangle placement around an anchor point.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
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
        x: clamp(
          options.anchor.x + offset.x - options.width / 2,
          2,
          GRAPH_WIDTH - options.width - 2
        ),
        y: clamp(
          options.anchor.y + offset.y - options.height / 2,
          2,
          GRAPH_HEIGHT - options.height - 2
        ),
        width: options.width,
        height: options.height,
      };
      const score =
        scoreAnnotationRect(candidate, {
          occupiedRects: options.occupiedRects,
          nodeObstacles: options.nodeObstacles,
        }) +
        Math.hypot(offset.x, offset.y) * 0.08;

      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return (
      best ?? {
        x: clamp(options.anchor.x - options.width / 2, 2, GRAPH_WIDTH - options.width - 2),
        y: clamp(options.anchor.y - options.height / 2, 2, GRAPH_HEIGHT - options.height - 2),
        width: options.width,
        height: options.height,
      }
    );
  }

  /**
   * Purpose: Score annotation placement candidates by overlap and distance penalties.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
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

  /**
   * Purpose: Compute intersection area between two axis-aligned rectangles.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function rectIntersectionArea(left: Rect, right: Rect): number {
    const overlapWidth =
      Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
    if (overlapWidth <= 0) return 0;

    const overlapHeight =
      Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
    if (overlapHeight <= 0) return 0;

    return overlapWidth * overlapHeight;
  }

  /**
   * Purpose: Compute Euclidean distance from a rectangle to a point.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
  function distanceFromRectToPoint(rect: Rect, point: Point): number {
    const clampedX = clamp(point.x, rect.x, rect.x + rect.width);
    const clampedY = clamp(point.y, rect.y, rect.y + rect.height);
    return Math.hypot(point.x - clampedX, point.y - clampedY);
  }

  /**
   * Purpose: Drop stale external hover/focus targets when indices are out of range.
   * Inputs: Raw event targets or serialized values declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
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

  /**
   * Purpose: Stop active flow-particle animation frame loops and timers.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function cancelAnimationLoop() {
    if (animationFrameHandle !== null) {
      cancelAnimationFrame(animationFrameHandle);
      animationFrameHandle = null;
    }
    isAnimationRunning = false;
  }

  /**
   * Purpose: Compute particle frame position/tangent for a path progress value.
   * Inputs: Numeric, structural, or model parameters declared in the signature.
   * Returns: A derived value computed from the provided inputs.
   * Side effects: None (pure computation).
   */
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
      magnitude > PROBABILITY_EPSILON ? { x: dx / magnitude, y: dy / magnitude } : { x: 1, y: 0 };
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

  /**
   * Purpose: Start per-edge flow-particle animation for the current transition step.
   * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
   * Returns: No value (`void`).
   * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
   */
  function startFlowAnimation(config: {
    animation: FlowAnimationState;
    nodeCircles: Map<number, SVGCircleElement>;
    pathByKey: Map<string, SVGPathElement>;
    pathSamplesByKey: Map<string, PathSampleCache>;
    usePathSampling: boolean;
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
      const sampledPath =
        config.usePathSampling ? config.pathSamplesByKey.get(particle.pathKey) ?? null : null;

      const dot = createSvgElement<SVGCircleElement>('circle');
      dot.classList.add('markov-flow-dot');
      dot.setAttribute('r', particle.radius.toFixed(2));
      dot.setAttribute('visibility', 'hidden');
      config.particleLayer.appendChild(dot);

      runtimeParticles.push({
        path,
        sampledPath,
        length: sampledPath ? sampledPath.totalLength : path.getTotalLength(),
        element: dot,
        delayMs: particle.delayMs,
        durationMs: particle.durationMs,
        pathPhase: particle.pathPhase,
        offsetNormal: particle.offsetNormal,
      });
    });

    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;

      runtimeParticles.forEach((particle) => {
        const localProgress = (elapsed - particle.delayMs) / particle.durationMs;
        const phasedProgress = localProgress + particle.pathPhase;
        if (phasedProgress <= 0 || phasedProgress >= 1) {
          particle.element.setAttribute('visibility', 'hidden');
          return;
        }

        const pathProgress = clamp01(phasedProgress);
        const sampleLength = pathProgress * particle.length;
        const frame = particle.sampledPath
          ? computePathFrameFromSamples(particle.sampledPath, sampleLength)
          : computePathFrame(particle.path, sampleLength, particle.length);
        const offsetX = frame.normal.x * particle.offsetNormal;
        const offsetY = frame.normal.y * particle.offsetNormal;

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
          circle.setAttribute('fill', colorForGraphHighlightedNodeValue(to));
        } else {
          circle.setAttribute('fill', colorForGraphNodeValue(to));
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

/**
 * Purpose: Enable high-node-count render acceleration only for dataset source mode.
 * Inputs: Current app state snapshot.
 * Returns: `true` when cached geometry + sampled path playback should be used.
 * Side effects: None (pure computation).
 */
function shouldUseAcceleratedGraphRendering(state: AppState): boolean {
  return state.sourceMode === 'dataset' && state.nodeCount >= DATASET_ACCELERATION_MIN_NODE_COUNT;
}

/**
 * Purpose: Build the geometry signature used to gate full SVG graph redraws.
 * Inputs: Current state, derived graph render data, and selected layout strategy id.
 * Returns: Signature object used by the geometry cache comparison.
 * Side effects: None (pure computation).
 */
function createGraphGeometrySignature(options: {
  state: AppState;
  graphData: GraphRenderData;
  layoutStrategyId: string;
}): GraphGeometrySignature {
  return {
    layoutStrategyId: options.layoutStrategyId,
    sourceMode: options.state.sourceMode,
    nodeCount: options.graphData.nodeCount,
    stateNodeCount: options.state.nodeCount,
    nodeIndices: [...options.graphData.nodeIndices],
    edgeKeys: [...options.graphData.edgeKeys],
    transitionMatrixRef: options.state.transitionMatrix,
  };
}

/**
 * Purpose: Compare geometry signatures to decide whether cached geometry can be reused.
 * Inputs: Previous and next signatures.
 * Returns: `true` when geometry can be reused safely.
 * Side effects: None (pure computation).
 */
function isSameGraphGeometrySignature(
  left: GraphGeometrySignature | null,
  right: GraphGeometrySignature
): boolean {
  if (!left) {
    return false;
  }
  return (
    left.layoutStrategyId === right.layoutStrategyId &&
    left.sourceMode === right.sourceMode &&
    left.nodeCount === right.nodeCount &&
    left.stateNodeCount === right.stateNodeCount &&
    left.transitionMatrixRef === right.transitionMatrixRef &&
    isSameNumberArray(left.nodeIndices, right.nodeIndices) &&
    isSameStringArray(left.edgeKeys, right.edgeKeys)
  );
}

/**
 * Purpose: Pre-sample an SVG path into arclength-indexed points and tangents.
 * Inputs: Edge path element.
 * Returns: Cached sampled path data for fast interpolation.
 * Side effects: Reads browser path geometry metrics.
 */
function buildPathSampleCache(path: SVGPathElement): PathSampleCache {
  const totalLength = Math.max(0, path.getTotalLength());
  const sampleCount = Math.floor(
    clamp(
      Math.round(totalLength / PATH_SAMPLE_SPACING_PX),
      PATH_SAMPLE_MIN_COUNT,
      PATH_SAMPLE_MAX_COUNT
    )
  );
  const sampleSize = sampleCount + 1;
  const sampleLengths = new Float32Array(sampleSize);
  const pointsX = new Float32Array(sampleSize);
  const pointsY = new Float32Array(sampleSize);
  const tangentsX = new Float32Array(sampleSize);
  const tangentsY = new Float32Array(sampleSize);

  for (let index = 0; index < sampleSize; index += 1) {
    const progress = sampleCount > 0 ? index / sampleCount : 0;
    const length = totalLength * progress;
    const point = path.getPointAtLength(length);
    sampleLengths[index] = length;
    pointsX[index] = point.x;
    pointsY[index] = point.y;
  }

  for (let index = 0; index < sampleSize; index += 1) {
    const prevIndex = Math.max(0, index - 1);
    const nextIndex = Math.min(sampleSize - 1, index + 1);
    const dx = pointsX[nextIndex] - pointsX[prevIndex];
    const dy = pointsY[nextIndex] - pointsY[prevIndex];
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > PROBABILITY_EPSILON) {
      tangentsX[index] = dx / magnitude;
      tangentsY[index] = dy / magnitude;
    } else {
      tangentsX[index] = 1;
      tangentsY[index] = 0;
    }
  }

  return {
    totalLength,
    sampleLengths,
    pointsX,
    pointsY,
    tangentsX,
    tangentsY,
  };
}

/**
 * Purpose: Interpolate point/tangent/normal from sampled path cache at a target arclength.
 * Inputs: Cached sampled path and target sample length.
 * Returns: Interpolated frame tuple for particle placement.
 * Side effects: None (pure computation).
 */
function computePathFrameFromSamples(
  cache: PathSampleCache,
  sampleLength: number
): {
  point: Point;
  tangent: Point;
  normal: Point;
} {
  const clampedLength = clamp(sampleLength, 0, cache.totalLength);
  const maxIndex = cache.sampleLengths.length - 1;
  if (maxIndex <= 0 || cache.totalLength <= PROBABILITY_EPSILON) {
    return {
      point: { x: cache.pointsX[0] ?? 0, y: cache.pointsY[0] ?? 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
    };
  }

  let low = 0;
  let high = maxIndex;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (cache.sampleLengths[mid] <= clampedLength) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const lowLength = cache.sampleLengths[low];
  const highLength = cache.sampleLengths[high];
  const span = Math.max(PROBABILITY_EPSILON, highLength - lowLength);
  const alpha = clamp((clampedLength - lowLength) / span, 0, 1);
  const point = {
    x: lerp(cache.pointsX[low], cache.pointsX[high], alpha),
    y: lerp(cache.pointsY[low], cache.pointsY[high], alpha),
  };
  const tangentCandidate = {
    x: lerp(cache.tangentsX[low], cache.tangentsX[high], alpha),
    y: lerp(cache.tangentsY[low], cache.tangentsY[high], alpha),
  };
  const tangentMagnitude = Math.hypot(tangentCandidate.x, tangentCandidate.y);
  const tangent =
    tangentMagnitude > PROBABILITY_EPSILON
      ? {
          x: tangentCandidate.x / tangentMagnitude,
          y: tangentCandidate.y / tangentMagnitude,
        }
      : { x: 1, y: 0 };
  return {
    point,
    tangent,
    normal: {
      x: -tangent.y,
      y: tangent.x,
    },
  };
}

/**
 * Resolve the active graph layout strategy id from source mode + dataset layout selection.
 */
function resolveLayoutStrategyId(state: AppState): string {
  if (state.sourceMode !== 'dataset') {
    return DEFAULT_GRAPH_LAYOUT_STRATEGY_ID;
  }
  switch (state.dataset.selectedLayoutId) {
    case 'community_force':
      return COMMUNITY_FORCE_GRAPH_LAYOUT_STRATEGY_ID;
    case 'radial_anchor':
      return RADIAL_ANCHOR_GRAPH_LAYOUT_STRATEGY_ID;
    case 'rank_layered':
    default:
      return RANK_LAYERED_GRAPH_LAYOUT_STRATEGY_ID;
  }
}

/**
 * Purpose: Render all graph edges, labels, nodes, and interaction affordances into SVG layers.
 * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
 * Returns: No value (`void`).
 * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
 */
function drawGraph(args: {
  state: AppState;
  layoutStrategyId: string;
  graphData: GraphRenderData;
  graphSvg: SVGSVGElement;
  edgeLayer: SVGGElement;
  annotationLayer: SVGGElement;
  nodeLayer: SVGGElement;
  currentNodeCircles: Map<number, SVGCircleElement>;
  currentPathByKey: Map<string, SVGPathElement>;
  currentPathSamplesByKey: Map<string, PathSampleCache>;
  currentEdgeBaseStyles: Map<string, EdgeVisualStyle>;
  currentEdgeLabelPoints: Map<string, Point>;
  currentNodeCenters: Map<number, Point>;
  markerDefs: SVGDefsElement;
  arrowMarkerCache: Map<string, string>;
  samplePathsForAnimation: boolean;
}) {
  args.edgeLayer.replaceChildren();
  args.annotationLayer.replaceChildren();
  args.nodeLayer.replaceChildren();
  args.currentNodeCircles.clear();
  args.currentPathByKey.clear();
  args.currentPathSamplesByKey.clear();
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
  }, args.layoutStrategyId);
  const edgeKeySet = new Set(args.graphData.edgeKeys);

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
        (args.graphData.transitionMatrix[toLocalIndex]?.[fromLocalIndex] ?? 0) >
          PROBABILITY_EPSILON,
        fromLocalIndex < toLocalIndex,
        nodeLayout,
        fromLocalIndex,
        toLocalIndex
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
              fromLocalIndex < toLocalIndex,
              nodeLayout,
              fromLocalIndex,
              toLocalIndex
            ));

      if (fromLocalIndex === toLocalIndex) {
        collisionPoints.push(...geometry.samplePoints);
      }

      edgePath.setAttribute('d', geometry.pathData);
      edgePath.setAttribute('fill', 'none');
      edgePath.classList.add('markov-edge');
      edgePath.setAttribute('data-graph-target-kind', 'edge');
      edgePath.setAttribute('data-from-index', String(fromIndex));
      edgePath.setAttribute('data-to-index', String(toIndex));

      const strokeWidth = 1.2 + probability * 7.6;
      const baseOpacity = 0.14 + probability * 0.86;
      const hue = 208;
      const lightness = 34;
      const stroke = `hsl(${hue.toFixed(1)} 72% ${lightness.toFixed(1)}%)`;
      const defaultMarkerId = getOrCreateArrowMarkerId({
        markerDefs: args.markerDefs,
        markerCache: args.arrowMarkerCache,
        variant: 'default',
        strokeWidth,
      });
      const highlightedMarkerId = getOrCreateArrowMarkerId({
        markerDefs: args.markerDefs,
        markerCache: args.arrowMarkerCache,
        variant: 'highlight',
        strokeWidth,
      });

      edgePath.style.stroke = stroke;
      edgePath.style.strokeWidth = strokeWidth.toFixed(3);
      edgePath.style.opacity = baseOpacity.toFixed(3);
      edgePath.dataset.defaultMarkerId = defaultMarkerId;
      edgePath.dataset.highlightMarkerId = highlightedMarkerId;
      edgePath.setAttribute('marker-end', markerUrl(defaultMarkerId));

      args.edgeLayer.appendChild(edgePath);
      args.currentPathByKey.set(key, edgePath);
      if (args.samplePathsForAnimation) {
        args.currentPathSamplesByKey.set(key, buildPathSampleCache(edgePath));
      }
      args.currentEdgeBaseStyles.set(key, {
        stroke,
        strokeWidth,
        opacity: baseOpacity,
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
    const displayNodeValue =
      args.state.flowAnimation?.fromVector[nodeIndex] ??
      args.graphData.currentVector[node.index] ??
      0;
    circle.setAttribute('fill', colorForGraphNodeValue(displayNodeValue));
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

/**
 * Purpose: Build edge path geometry and label anchor for a directed transition edge.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function createEdgePath(
  fromNode: GraphNodeLayout,
  toNode: GraphNodeLayout,
  probability: number,
  hasReverseEdge: boolean,
  isForwardPair: boolean,
  allNodes: readonly GraphNodeLayout[],
  fromNodeIndex: number,
  toNodeIndex: number
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
  const preferredDirectionSign = hasReverseEdge ? (isForwardPair ? pairSign : -pairSign) : pairSign;
  const directionCandidates = [preferredDirectionSign, -preferredDirectionSign];
  const maxAvoidanceOffset = centerDistance * EDGE_MAX_AVOIDANCE_OFFSET_SCALE;

  let bestGeometry: PathGeometry | null = null;
  let bestClearance = Number.NEGATIVE_INFINITY;
  let bestUsesPreferredDirection = false;
  let bestMagnitude = Number.POSITIVE_INFINITY;

  directionCandidates.forEach((directionSign, directionIndex) => {
    EDGE_BEND_SCALE_CANDIDATES.forEach((scale) => {
      const magnitude = Math.min(maxAvoidanceOffset, bendMagnitude * scale);
      const normalOffset = directionSign * magnitude;
      const candidate = buildEdgeGeometryFromOffset({
        fromNode,
        toNode,
        centerDistance,
        ux,
        uy,
        perpX,
        perpY,
        normalOffset,
        hasReverseEdge,
        directionSign,
      });
      const clearance = minimumClearanceToUnrelatedNodes(
        candidate.samplePoints,
        allNodes,
        fromNodeIndex,
        toNodeIndex
      );
      const usesPreferredDirection = directionIndex === 0;
      const shouldReplace =
        clearance > bestClearance + 1e-6 ||
        (Math.abs(clearance - bestClearance) <= 1e-6 &&
          usesPreferredDirection &&
          !bestUsesPreferredDirection) ||
        (Math.abs(clearance - bestClearance) <= 1e-6 &&
          usesPreferredDirection === bestUsesPreferredDirection &&
          magnitude < bestMagnitude - 1e-6);

      if (shouldReplace) {
        bestGeometry = candidate;
        bestClearance = clearance;
        bestUsesPreferredDirection = usesPreferredDirection;
        bestMagnitude = magnitude;
      }
    });
  });

  return (
    bestGeometry ??
    buildEdgeGeometryFromOffset({
      fromNode,
      toNode,
      centerDistance,
      ux,
      uy,
      perpX,
      perpY,
      normalOffset: preferredDirectionSign * bendMagnitude,
      hasReverseEdge,
      directionSign: preferredDirectionSign,
    })
  );
}

/**
 * Purpose: Build cubic edge geometry from bend/offset parameters.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function buildEdgeGeometryFromOffset(options: {
  fromNode: GraphNodeLayout;
  toNode: GraphNodeLayout;
  centerDistance: number;
  ux: number;
  uy: number;
  perpX: number;
  perpY: number;
  normalOffset: number;
  hasReverseEdge: boolean;
  directionSign: number;
}): PathGeometry {
  const centerCurve: CubicCurve = {
    start: { x: options.fromNode.x, y: options.fromNode.y },
    controlA: {
      x:
        options.fromNode.x +
        options.ux * (options.centerDistance * EDGE_CUBIC_START_HANDLE) +
        options.perpX * options.normalOffset,
      y:
        options.fromNode.y +
        options.uy * (options.centerDistance * EDGE_CUBIC_START_HANDLE) +
        options.perpY * options.normalOffset,
    },
    controlB: {
      x:
        options.toNode.x -
        options.ux * (options.centerDistance * EDGE_CUBIC_END_HANDLE) +
        options.perpX * options.normalOffset,
      y:
        options.toNode.y -
        options.uy * (options.centerDistance * EDGE_CUBIC_END_HANDLE) +
        options.perpY * options.normalOffset,
    },
    end: { x: options.toNode.x, y: options.toNode.y },
  };

  const boundaryT = findArrowTipBoundaryT(
    centerCurve,
    { x: options.toNode.x, y: options.toNode.y },
    NODE_RADIUS
  );
  const clippedCurve = clipCubicCurve(centerCurve, clamp(boundaryT, 0.02, 1));

  const rawLabelPoint = cubicAt(
    clippedCurve.start,
    clippedCurve.controlA,
    clippedCurve.controlB,
    clippedCurve.end,
    EDGE_LABEL_TAIL_BIAS
  );
  const labelNudge = options.hasReverseEdge ? 8 : 5;
  const labelDirection =
    Math.abs(options.normalOffset) <= PROBABILITY_EPSILON
      ? options.directionSign
      : Math.sign(options.normalOffset);
  const labelPoint = {
    x: rawLabelPoint.x + options.perpX * labelNudge * labelDirection,
    y: rawLabelPoint.y + options.perpY * labelNudge * labelDirection,
  };

  const samplePoints = sampleCubicCurve({
    start: clippedCurve.start,
    controlA: clippedCurve.controlA,
    controlB: clippedCurve.controlB,
    end: clippedCurve.end,
    sampleCount: 20,
    startT: 0.06,
    endT: 0.96,
  });

  return {
    pathData: `M ${clippedCurve.start.x.toFixed(2)} ${clippedCurve.start.y.toFixed(2)} C ${clippedCurve.controlA.x.toFixed(2)} ${clippedCurve.controlA.y.toFixed(2)} ${clippedCurve.controlB.x.toFixed(2)} ${clippedCurve.controlB.y.toFixed(2)} ${clippedCurve.end.x.toFixed(2)} ${clippedCurve.end.y.toFixed(2)}`,
    labelPoint,
    samplePoints,
  };
}

/**
 * Purpose: Build path geometry for self-loop edges with collision-aware scoring.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute a point on a circle around a node center.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Choose a stable bend direction for bidirectional edge pairs.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Build loop control points and sampled points for one loop angle/radius.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Sample points along a self-loop arc for collision scoring.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Solve the cubic parameter where arrow tip reaches node boundary clearance.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function findArrowTipBoundaryT(
  curve: CubicCurve,
  targetCenter: Point,
  targetRadius: number
): number {
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

/**
 * Purpose: Measure boundary error for a candidate arrow-tip parameter value.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function markerTipBoundaryError(
  curve: CubicCurve,
  t: number,
  targetCenter: Point,
  targetRadius: number
): number {
  const markerTip = markerTipPointAt(curve, t);
  return Math.hypot(markerTip.x - targetCenter.x, markerTip.y - targetCenter.y) - targetRadius;
}

/**
 * Purpose: Compute marker-tip point on the cubic at parameter t.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute tangent vector of a cubic Bezier at parameter t.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Clip a cubic Bezier segment at parameter t.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Linearly interpolate between two points.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function lerpPoint(from: Point, to: Point, t: number): Point {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/**
 * Purpose: Build deterministic angular offset candidates for self-loop search.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function buildLoopAngleOffsets(): number[] {
  const offsets: number[] = [0];
  for (let sweep = 1; sweep <= LOOP_ANGLE_SWEEPS; sweep += 1) {
    const delta = sweep * LOOP_ANGLE_STEP;
    offsets.push(delta, -delta);
  }
  return offsets;
}

/**
 * Purpose: Score self-loop geometry against overlap/clearance heuristics.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute minimum pairwise distance between two sampled point sets.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute minimum loop clearance against non-self node circles.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute minimum edge clearance against nodes not incident to the edge.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function minimumClearanceToUnrelatedNodes(
  samples: readonly Point[],
  allNodes: readonly GraphNodeLayout[],
  fromNodeIndex: number,
  toNodeIndex: number
): number {
  if (allNodes.length <= 2) {
    return 1000;
  }

  let minClearance = Number.POSITIVE_INFINITY;
  samples.forEach((sample) => {
    allNodes.forEach((node) => {
      if (node.index === fromNodeIndex || node.index === toNodeIndex) return;
      const centerDistance = Math.hypot(sample.x - node.x, sample.y - node.y);
      const clearance = centerDistance - (NODE_RADIUS + EDGE_NODE_CLEARANCE_MARGIN);
      if (clearance < minClearance) {
        minClearance = clearance;
      }
    });
  });

  return Number.isFinite(minClearance) ? minClearance : 1000;
}

/**
 * Purpose: Compute minimum clearance from sampled points to SVG bounds.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Evaluate a cubic Bezier point at parameter t.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Sample points along a cubic Bezier curve for scoring and collision checks.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Clamp a numeric value into an inclusive [min, max] range.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function clamp(value: number, min: number, max: number): number {
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

/**
 * Purpose: Clamp a numeric value into [0, 1].
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Purpose: Apply cubic ease-in-out easing to normalized animation progress.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

/**
 * Purpose: Map a node value to the non-highlight graph fill color scale.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function colorForGraphNodeValue(value: number): string {
  const normalized = clamp01(value);
  const hue = 206;
  const saturation = 60;
  const lightness = 93 - normalized * 46;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(1)}%)`;
}

/**
 * Purpose: Map a highlighted node value to an HSL display color.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function colorForGraphHighlightedNodeValue(value: number): string {
  const normalized = clamp01(value);
  const hue = 10;
  const saturation = 65;
  const lightness = 93 - normalized * 42;
  return `hsl(${hue} ${saturation}% ${lightness.toFixed(1)}%)`;
}

/**
 * Purpose: Render node labels with subscript suffixes in SVG text/tspan nodes.
 * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
 * Returns: No value (`void`).
 * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
 */
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

/**
 * Purpose: Parse a serialized edge key into source and target node indices.
 * Inputs: Raw event targets or serialized values declared in the signature.
 * Returns: Parsed/derived value, or `null` when mapping is not possible.
 * Side effects: None (pure computation).
 */
function parseEdgeKey(key: string): { fromIndex: number; toIndex: number } | null {
  const match = /^edge-(\d+)-(\d+)$/.exec(key);
  if (!match) return null;
  return {
    fromIndex: Number.parseInt(match[1], 10),
    toIndex: Number.parseInt(match[2], 10),
  };
}

/**
 * Purpose: Normalize partial subgraph selection updates into safe bounded values.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
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
    typeof selection.minEdgeProbability === 'number' &&
    Number.isFinite(selection.minEdgeProbability)
      ? selection.minEdgeProbability
      : fallback.minEdgeProbability;
  const minEdgeProbability = clamp(minEdgeProbabilityRaw, 0, 1);

  return {
    mode,
    maxNodes,
    minEdgeProbability,
  };
}

/**
 * Purpose: Compare subgraph selection objects for structural equality.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: Boolean condition result.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Build a local SVG marker URL reference.
 * Inputs: Numeric, structural, or model parameters declared in the signature.
 * Returns: A derived value computed from the provided inputs.
 * Side effects: None (pure computation).
 */
function markerUrl(markerId: string): string {
  return `url(#${markerId})`;
}

/**
 * Purpose: Convert reducer edit targets to graph interaction targets when possible.
 * Inputs: Reducer edit target or `null`.
 * Returns: Equivalent graph interaction target, or `null` for unsupported targets.
 * Side effects: None (pure computation).
 */
function graphInteractionTargetFromEditTarget(
  target:
    | {
        kind: 'edge';
        fromIndex: number;
        toIndex: number;
      }
    | {
        kind: 'node';
        index: number;
      }
    | {
        kind: 'initial';
        index: number;
      }
    | null
): GraphInteractionTarget | null {
  if (!target) {
    return null;
  }
  if (target.kind === 'edge') {
    return {
      kind: 'edge',
      fromIndex: target.fromIndex,
      toIndex: target.toIndex,
    };
  }
  if (target.kind === 'node') {
    return {
      kind: 'node',
      nodeIndex: target.index,
    };
  }
  return null;
}

/**
 * Purpose: Build a stable semantic key for graph interaction targets.
 * Inputs: Optional interaction target.
 * Returns: Stable key string or `null`.
 * Side effects: None (pure computation).
 */
function interactionTargetKey(target: GraphInteractionTarget | null): string | null {
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
 * Purpose: Resolve an SVG marker id for a stroke width, creating the marker when needed.
 * Inputs: Marker registry state, marker variant, and edge stroke width.
 * Returns: Marker id string for `marker-end`.
 * Side effects: Appends new marker definitions to the graph `<defs>` section.
 */
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
  path.setAttribute('fill', options.variant === 'highlight' ? EDGE_HIGHLIGHT_STROKE : '#0f4c81');
  marker.appendChild(path);

  options.markerDefs.appendChild(marker);
  options.markerCache.set(cacheKey, markerId);
  return markerId;
}

/**
 * Purpose: Quantize stroke width to stable marker-size buckets.
 * Inputs: Edge stroke width.
 * Returns: Bucketed stroke width value used by marker cache keys.
 * Side effects: None (pure computation).
 */
function quantizeArrowStrokeWidth(strokeWidth: number): number {
  const safeStrokeWidth = Math.max(0, strokeWidth);
  const bucketed =
    Math.round(safeStrokeWidth / ARROW_HEAD_SIZE_BUCKET_STEP) * ARROW_HEAD_SIZE_BUCKET_STEP;
  return Math.max(ARROW_HEAD_STROKE_BASELINE, bucketed);
}

/**
 * Purpose: Compute arrowhead width/height/ref anchors from edge stroke width.
 * Inputs: Bucketed edge stroke width.
 * Returns: Arrow marker geometry dimensions.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Compute node indices that remain at least partially visible in the current viewport.
 * Inputs: Viewport transform and node center map keyed by global node index.
 * Returns: Sorted list of visible node indices.
 * Side effects: None (pure computation).
 */
function computeViewportVisibleNodeIndices(
  transform: GraphViewportTransform,
  nodeCenters: ReadonlyMap<number, Point>
): number[] {
  const visible: number[] = [];
  nodeCenters.forEach((center, index) => {
    const screenX = center.x * transform.scale + transform.translateX;
    const screenY = center.y * transform.scale + transform.translateY;
    const radius = NODE_RADIUS * transform.scale;
    const intersects =
      screenX + radius >= 0 &&
      screenX - radius <= GRAPH_WIDTH &&
      screenY + radius >= 0 &&
      screenY - radius <= GRAPH_HEIGHT;
    if (intersects) {
      visible.push(index);
    }
  });
  visible.sort((left, right) => left - right);
  return visible;
}

/**
 * Purpose: Compare graph context snapshots to avoid redundant external panel updates.
 * Inputs: Previous and next context snapshots.
 * Returns: `true` when all fields are semantically equal.
 * Side effects: None (pure computation).
 */
function isSameGraphPanelContext(
  left: GraphPanelContextSnapshot | null,
  right: GraphPanelContextSnapshot
): boolean {
  if (!left) {
    return false;
  }

  return (
    isSameNumberArray(left.renderedNodeIndices, right.renderedNodeIndices) &&
    isSameNumberArray(left.viewportVisibleNodeIndices, right.viewportVisibleNodeIndices) &&
    isSameGraphInteractionTarget(left.activeTarget, right.activeTarget) &&
    isSameGraphInteractionTarget(left.selectedTarget, right.selectedTarget)
  );
}

/**
 * Purpose: Compare numeric arrays by length and ordered values.
 * Inputs: Two readonly numeric arrays.
 * Returns: `true` when lengths and values are identical.
 * Side effects: None (pure computation).
 */
function isSameNumberArray(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Purpose: Compare string arrays by length and ordered values.
 * Inputs: Two readonly string arrays.
 * Returns: `true` when lengths and values are identical.
 * Side effects: None (pure computation).
 */
function isSameStringArray(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Purpose: Read the graph interaction target from a DOM event target.
 * Inputs: Raw event targets or serialized values declared in the signature.
 * Returns: Parsed/derived value, or `null` when mapping is not possible.
 * Side effects: None (pure computation).
 */
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

/**
 * Purpose: Create an SVG element in the SVG namespace.
 * Inputs: SVG tag name to instantiate.
 * Returns: A new SVG element typed to `T`.
 * Side effects: Creates a detached SVG node.
 */
function createSvgElement<T extends SVGElement>(tagName: string): T {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName) as T;
}
