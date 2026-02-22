import '@shared/ui/base-shell.css';
import './style.css';
import {
  renderLayoutPlan,
  type LayoutNodeRenderOutput,
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import { applyLayoutTokens } from '@shared/lib/layout-runtime';
import { getApiBaseUrl } from '@shared/lib/api';
import { createGraphPanelController, type GraphPanelContextSnapshot } from './app/render-graph';
import type { GraphInteractionTarget } from './app/graph-interaction-presenter';
import type { PanelRenderContext, PanelScopeMode } from './app/panel-context';
import { createMatrixPanelController } from './app/render-matrix-panel';
import { createStatePanelController } from './app/render-state-panel';
import { reducer, createInitialState } from './app/reducer';
import { selectEffectiveHighlightTarget } from './app/selectors';
import { createStore } from './app/store';
import type { AppState } from './app/types';
import type { EditOp, EditTarget, PanelId } from './app/edit-session';
import { createTransitionGraphGenerator } from './lib/transition-graph-generator';
import { ACTIVE_MARKOV_LAYOUT_PROFILE, type MarkovPanelId } from './layout-options';

const API_BASE = getApiBaseUrl() || '(same origin)';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app element');
}

root.innerHTML = `
  <div class="base-shell markov-shell">
    <header class="base-header">
      <div>
        <h1 class="base-title">Markov Chain Lab</h1>
        <p class="base-subtitle">
          Build a chain with up to 10 states, inspect x<sub>t</sub>, and animate probability flow along directed edges.
        </p>
      </div>
      <div class="markov-api-pill">API base: <code>${API_BASE}</code></div>
    </header>
    <section
      class="markov-layout ${ACTIVE_MARKOV_LAYOUT_PROFILE.containerModeClassName}"
      id="markov-layout-root"
    ></section>
  </div>
`;

const shell = requireElement<HTMLDivElement>(root, '.markov-shell');
applyLayoutTokens(shell, ACTIVE_MARKOV_LAYOUT_PROFILE.tokens);

const store = createStore(createInitialState(), reducer);
const transitionGraphGenerator = createTransitionGraphGenerator();
const AUTO_STEP_TICK_MS = 90;

let isAutoStepRunning = false;
let isRenderingFromStore = false;
let panelScopeMode: PanelScopeMode = 'full-extracted';
let graphPanelContext: GraphPanelContextSnapshot = {
  renderedNodeIndices: [],
  viewportVisibleNodeIndices: [],
  activeTarget: null,
  selectedTarget: null,
};

/**
 * Purpose: Toggle the auto-step loop state and keep the state panel toggle in sync.
 * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
 * Returns: No value (`void`).
 * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
 */
function setAutoStepRunning(running: boolean) {
  isAutoStepRunning = running;
  statePanel.setAutoStepRunning(running);
}

/**
 * Purpose: Advance one simulation tick when auto-step is enabled and stepping is valid.
 * Inputs: No direct parameters; reads the current store snapshot and auto-step flag.
 * Returns: No value (`void`).
 * Side effects: Dispatches store actions and can disable auto-step when stepping is blocked.
 */
function runAutoStepTick() {
  if (!isAutoStepRunning) {
    return;
  }

  const snapshot = store.getState();
  if (snapshot.flowAnimation) {
    return;
  }
  if (!snapshot.validation.canStep && !snapshot.hasPendingMatrixEdits) {
    setAutoStepRunning(false);
    return;
  }

  store.dispatch({ type: 'STEP' });
}

const graphPanel = createGraphPanelController({
  dispatch: store.dispatch,
  onFlowAnimationComplete(animationId) {
    store.dispatch({ type: 'CLEAR_FLOW_ANIMATION', animationId });
    runAutoStepTick();
  },
  onSetNodeCount(nodeCount) {
    setAutoStepRunning(false);
    store.dispatch({ type: 'SET_NODE_COUNT', nodeCount });
    const updated = store.getState();
    const generated = transitionGraphGenerator.generate({
      nodeCount: updated.nodeCount,
    });
    store.dispatch({
      type: 'APPLY_GENERATED_GRAPH',
      transitionMatrix: generated.transitionMatrix,
      initialVector: generated.initialVector,
      currentVector: generated.currentVector,
    });
  },
  onGenerateRandomDirectedGraph() {
    setAutoStepRunning(false);
    const snapshot = store.getState();
    const generated = transitionGraphGenerator.generate({
      nodeCount: snapshot.nodeCount,
    });
    store.dispatch({
      type: 'APPLY_GENERATED_GRAPH',
      transitionMatrix: generated.transitionMatrix,
      initialVector: generated.initialVector,
      currentVector: generated.currentVector,
    });
  },
  onContextChange(context) {
    graphPanelContext = context;
    if (isRenderingFromStore) {
      return;
    }
    if (hasFocusedPanelInput()) {
      return;
    }
    renderSidePanels(store.getState());
  },
});

const statePanel = createStatePanelController({
  dispatch: store.dispatch,
  onToggleAutoStep() {
    setAutoStepRunning(!isAutoStepRunning);
    runAutoStepTick();
  },
});

const matrixPanel = createMatrixPanelController({
  dispatch: store.dispatch,
  onSetScopeMode(mode) {
    if (panelScopeMode === mode) {
      return;
    }
    panelScopeMode = mode;
    renderSidePanels(store.getState());
  },
});

registerPanelInputGraphHighlighting(statePanel.element, readGraphTargetFromPanelElement);
registerPanelInputGraphHighlighting(matrixPanel.element, readGraphTargetFromPanelElement);

const registry: LayoutRendererRegistry<MarkovPanelId> = {
  byPanelId: {
    top: () => createTopPanelNode(),
    graph: () => graphPanel.element,
    state: () => statePanel.element,
    matrix: () => matrixPanel.element,
  },
};

const layoutRoot = requireElement<HTMLDivElement>(root, '#markov-layout-root');
renderLayoutPlan({
  container: layoutRoot,
  plan: ACTIVE_MARKOV_LAYOUT_PROFILE.renderPlan,
  registry,
});

store.subscribe(render);
render();
const autoStepIntervalId = window.setInterval(runAutoStepTick, AUTO_STEP_TICK_MS);

const handleGlobalEditUndoRedo = (event: KeyboardEvent) => {
  const state = store.getState();
  if (state.editSession.mode !== 'editing') {
    return;
  }
  if (event.altKey) {
    return;
  }
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  if (!hasPrimaryModifier) {
    return;
  }
  const key = event.key.toLowerCase();
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
  if (!isUndo && !isRedo) {
    return;
  }

  if (isUndo && state.editSession.undoStack.length <= 0) {
    return;
  }
  if (isRedo && state.editSession.redoStack.length <= 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (isUndo) {
    const undoOp = state.editSession.undoStack[state.editSession.undoStack.length - 1];
    const targetPanel = resolvePanelForEditTarget(undoOp.target, undoOp.panel ?? state.editSession.ownerPanel);
    if (targetPanel) {
      store.dispatch({
        type: 'EDIT_FOCUS_TARGET',
        panel: targetPanel,
        target: undoOp.target,
      });
    }
    const focusToken = focusTokenForEditOp(
      undoOp,
      targetPanel ?? state.editSession.ownerPanel
    );
    store.dispatch({ type: 'EDIT_UNDO' });
    if (focusToken) {
      window.setTimeout(() => {
        restoreFocusFromToken(focusToken, { armOverwrite: true });
      }, 0);
    }
    return;
  }

  const focusToken = captureActiveEditInputFocusToken();
  store.dispatch({ type: 'EDIT_REDO' });
  if (!focusToken) {
    return;
  }
  window.setTimeout(() => {
    restoreFocusFromToken(focusToken, { armOverwrite: true });
  }, 0);
};
window.addEventListener('keydown', handleGlobalEditUndoRedo, true);

window.addEventListener(
  'click',
  (event) => {
    if (isAutoStepRunning) {
      const clickTarget = event.target;
      const isToggleAutoStepButton =
        clickTarget instanceof Element &&
        Boolean(clickTarget.closest('[data-action="toggle-auto-step"]'));
      if (!isToggleAutoStepButton) {
        setAutoStepRunning(false);
      }
    }
  },
  true
);

window.addEventListener('beforeunload', () => {
  window.clearInterval(autoStepIntervalId);
  window.removeEventListener('keydown', handleGlobalEditUndoRedo, true);
  setAutoStepRunning(false);
  graphPanel.destroy();
});

/**
 * Purpose: Render all Markov panels from the latest store snapshot.
 * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
 * Returns: No value (`void`).
 * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
 */
function render() {
  const state = store.getState();
  isRenderingFromStore = true;
  try {
    graphPanel.render(state);
    renderSidePanels(state);
  } finally {
    isRenderingFromStore = false;
  }
}

/**
 * Purpose: Render matrix/state panels from current app + graph interaction context.
 * Inputs: Current app state snapshot.
 * Returns: No value (`void`).
 * Side effects: Updates panel DOM content and highlight state.
 */
function renderSidePanels(state: AppState) {
  const panelContext = buildPanelRenderContext(state);
  statePanel.render(state, panelContext);
  matrixPanel.render(state, panelContext);
}

/**
 * Purpose: Build render context consumed by matrix and state panels.
 * Inputs: Current app state snapshot.
 * Returns: Combined panel context with scope, visibility, and interaction targets.
 * Side effects: None (pure computation).
 */
function buildPanelRenderContext(state: AppState): PanelRenderContext {
  const extractedNodeIndices =
    graphPanelContext.renderedNodeIndices.length > 0
      ? [...graphPanelContext.renderedNodeIndices]
      : Array.from({ length: state.nodeCount }, (_, index) => index);
  const viewportVisibleNodeIndices =
    graphPanelContext.viewportVisibleNodeIndices.length > 0
      ? [...graphPanelContext.viewportVisibleNodeIndices]
      : [...extractedNodeIndices];

  const effectiveTarget = selectEffectiveHighlightTarget(state);
  return {
    scopeMode: panelScopeMode,
    extractedNodeIndices,
    viewportVisibleNodeIndices,
    activeTarget: (effectiveTarget as GraphInteractionTarget | null) ?? graphPanelContext.activeTarget,
    selectedTarget: graphPanelContext.selectedTarget,
  };
}

/**
 * Purpose: Wire panel pointer/focus events to graph hover/focus highlighting.
 * Inputs: UI state, DOM references, and interaction/geometry parameters declared in the signature.
 * Returns: No value (`void`).
 * Side effects: Updates Markov panel runtime state and/or DOM/SVG nodes.
 */
function registerPanelInputGraphHighlighting(
  panelElement: HTMLElement,
  readTarget: (eventTarget: EventTarget | null) => GraphInteractionTarget | null
) {
  const syncFocusTargetFromActiveElement = () => {
    graphPanel.setExternalFocusTarget(readTarget(document.activeElement));
  };

  panelElement.addEventListener('pointermove', (event) => {
    graphPanel.setExternalHoverTarget(readTarget(event.target));
  });

  panelElement.addEventListener('pointerleave', () => {
    graphPanel.setExternalHoverTarget(null);
  });

  panelElement.addEventListener('focusin', (event) => {
    graphPanel.setExternalFocusTarget(readTarget(event.target));
  });

  panelElement.addEventListener('focusout', (event) => {
    graphPanel.setExternalFocusTarget(readTarget((event as FocusEvent).relatedTarget));
  });

  panelElement.addEventListener('click', (event) => {
    graphPanel.setExternalFocusTarget(readTarget(event.target));
  });

  panelElement.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') {
      return;
    }
    window.setTimeout(syncFocusTargetFromActiveElement, 0);
  });
}

/**
 * Purpose: Map panel elements carrying graph-target datasets to interaction targets.
 * Inputs: Raw event targets or serialized values declared in the signature.
 * Returns: Parsed/derived value, or `null` when mapping is not possible.
 * Side effects: None (pure computation).
 */
function readGraphTargetFromPanelElement(
  eventTarget: EventTarget | null
): GraphInteractionTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const graphTargetElement = eventTarget.closest<HTMLElement>('[data-graph-target-kind]');
  if (!graphTargetElement) {
    return null;
  }

  const kind = graphTargetElement.dataset.graphTargetKind;
  if (kind === 'node') {
    const nodeIndex = Number.parseInt(graphTargetElement.dataset.nodeIndex ?? '', 10);
    if (!Number.isInteger(nodeIndex)) {
      return null;
    }
    return {
      kind: 'node',
      nodeIndex,
    };
  }

  if (kind === 'incoming-node') {
    const nodeIndex = Number.parseInt(graphTargetElement.dataset.nodeIndex ?? '', 10);
    if (!Number.isInteger(nodeIndex)) {
      return null;
    }
    return {
      kind: 'incoming-node',
      nodeIndex,
    };
  }

  if (kind !== 'edge') {
    return null;
  }

  const fromIndex = Number.parseInt(graphTargetElement.dataset.fromIndex ?? '', 10);
  const toIndex = Number.parseInt(graphTargetElement.dataset.toIndex ?? '', 10);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return null;
  }
  const edgeWeight = Number.parseFloat(graphTargetElement.dataset.edgeWeight ?? '');
  if (Number.isFinite(edgeWeight) && edgeWeight <= 1e-6) {
    return null;
  }

  return {
    kind: 'edge',
    fromIndex,
    toIndex,
  };
}

/**
 * Purpose: Detect whether a matrix/state numeric input currently owns focus.
 * Inputs: No direct parameters.
 * Returns: `true` when a panel input has focus.
 * Side effects: None (pure computation).
 */
function hasFocusedPanelInput(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) {
    return false;
  }
  if (!active.classList.contains('markov-number-input')) {
    return false;
  }
  return statePanel.element.contains(active) || matrixPanel.element.contains(active);
}


/**
 * Purpose: Create the shared parent layout node that hosts graph and state child panels.
 * Inputs: No direct parameters.
 * Returns: A layout render output containing the wrapper element and child mount container.
 * Side effects: Creates detached DOM nodes for layout composition.
 */
function createTopPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement(`
    <section class="markov-top-panel">
      <div class="markov-top-grid"></div>
    </section>
  `);

  const childContainer = requireElement<HTMLDivElement>(element, '.markov-top-grid');
  return {
    element,
    childContainer,
  };
}

/**
 * Purpose: Create a single HTMLElement from markup and validate root shape.
 * Inputs: `markup` string containing one root element template.
 * Returns: The parsed root `HTMLElement`.
 * Side effects: Creates detached DOM nodes and throws if markup does not produce one root element.
 */
function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement.');
  }
  return node;
}

/**
 * Purpose: Query for a required element and fail fast when it is missing.
 * Inputs: Parent query root and CSS selector to resolve.
 * Returns: The matching element cast to the requested type parameter.
 * Side effects: Reads the DOM and throws if the required element is missing.
 */
function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

type FocusToken = {
  panel: 'matrix' | 'state' | 'graph';
  selector: string;
};

function captureActiveEditInputFocusToken(): FocusToken | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) {
    return null;
  }

  if (active.classList.contains('markov-number-input--matrix')) {
    const fromIndex = Number.parseInt(active.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(active.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return null;
    }
    return {
      panel: 'matrix',
      selector: `input.markov-number-input--matrix[data-from-index="${fromIndex}"][data-to-index="${toIndex}"]`,
    };
  }

  if (active.classList.contains('markov-number-input--state') && active.dataset.kind === 'initial') {
    const index = Number.parseInt(active.dataset.index ?? '', 10);
    if (!Number.isInteger(index)) {
      return null;
    }
    return {
      panel: 'state',
      selector: `input.markov-number-input--state[data-kind="initial"][data-index="${index}"]`,
    };
  }

  const action = active.dataset.action;
  if (action === 'graph-set-edge-weight') {
    const fromIndex = Number.parseInt(active.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(active.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return null;
    }
    return {
      panel: 'graph',
      selector: `input[data-action="graph-set-edge-weight"][data-from-index="${fromIndex}"][data-to-index="${toIndex}"]`,
    };
  }

  if (action === 'graph-set-node-value') {
    const nodeIndex = Number.parseInt(active.dataset.nodeIndex ?? '', 10);
    if (!Number.isInteger(nodeIndex)) {
      return null;
    }
    return {
      panel: 'graph',
      selector: `input[data-action="graph-set-node-value"][data-node-index="${nodeIndex}"]`,
    };
  }

  return null;
}

function restoreFocusFromToken(
  token: FocusToken,
  options: {
    armOverwrite?: boolean;
  } = {}
) {
  const root =
    token.panel === 'matrix'
      ? matrixPanel.element
      : token.panel === 'state'
        ? statePanel.element
        : graphPanel.element;
  const input = root.querySelector<HTMLInputElement>(token.selector);
  if (!input) {
    return;
  }
  input.focus({ preventScroll: true });
  if (options.armOverwrite) {
    try {
      input.select();
    } catch {
      // Ignore selection failures; focus has still been restored.
    }
  }
}

function focusTokenForEditOp(op: EditOp, fallbackPanel: PanelId | null): FocusToken | null {
  const panel = resolvePanelForEditTarget(op.target, op.panel ?? fallbackPanel);
  if (!panel) {
    return null;
  }

  if (op.target.kind === 'edge') {
    return {
      panel,
      selector:
        panel === 'graph'
          ? `input[data-action="graph-set-edge-weight"][data-from-index="${op.target.fromIndex}"][data-to-index="${op.target.toIndex}"]`
          : `input.markov-number-input--matrix[data-from-index="${op.target.fromIndex}"][data-to-index="${op.target.toIndex}"]`,
    };
  }

  if (op.target.kind === 'node') {
    return {
      panel: 'graph',
      selector: `input[data-action="graph-set-node-value"][data-node-index="${op.target.index}"]`,
    };
  }

  return {
    panel: 'state',
    selector: `input.markov-number-input--state[data-kind="initial"][data-index="${op.target.index}"]`,
  };
}

function resolvePanelForEditTarget(target: EditTarget, panelHint: PanelId | null): PanelId | null {
  if (target.kind === 'initial') {
    return 'state';
  }
  if (target.kind === 'node') {
    return 'graph';
  }
  if (panelHint === 'graph' || panelHint === 'matrix') {
    return panelHint;
  }
  return 'matrix';
}
