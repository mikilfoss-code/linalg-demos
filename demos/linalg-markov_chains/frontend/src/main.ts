import '@shared/ui/base-shell.css';
import './style.css';
import {
  renderLayoutPlan,
  type LayoutNodeRenderOutput,
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import { applyLayoutTokens } from '@shared/lib/layout-runtime';
import { getApiBaseUrl } from '@shared/lib/api';
import { createGraphPanelController } from './app/render-graph';
import type { GraphInteractionTarget } from './app/graph-interaction-presenter';
import { createMatrixPanelController } from './app/render-matrix-panel';
import { createStatePanelController } from './app/render-state-panel';
import { reducer, createInitialState } from './app/reducer';
import { createStore } from './app/store';
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
          Build a chain with up to 8 states, inspect x<sub>t</sub>, and animate probability flow along directed edges.
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

/**
 * Purpose: setAutoStepRunning function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function setAutoStepRunning(running: boolean) {
  isAutoStepRunning = running;
  statePanel.setAutoStepRunning(running);
}

/**
 * Purpose: runAutoStepTick function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
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
  onSetTransitionCell(rowIndex, colIndex, value) {
    store.dispatch({
      type: 'SET_GRAPH_EDGE_CELL',
      rowIndex,
      colIndex,
      value,
    });
  },
  onSetCurrentCell(index, value) {
    store.dispatch({
      type: 'SET_GRAPH_NODE_VALUE',
      index,
      value,
    });
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
});

registerPanelInputGraphHighlighting(
  statePanel.element,
  readNodeTargetFromStateInput
);
registerPanelInputGraphHighlighting(
  matrixPanel.element,
  readEdgeTargetFromMatrixInput
);

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

window.addEventListener(
  'click',
  (event) => {
    if (isAutoStepRunning) {
      const clickTarget = event.target;
      const isToggleAutoStepButton =
        clickTarget instanceof Element && Boolean(clickTarget.closest('[data-action="toggle-auto-step"]'));
      if (!isToggleAutoStepButton) {
        setAutoStepRunning(false);
      }
    }

    const snapshot = store.getState();
    if (!snapshot.hasPendingMatrixEdits) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (matrixPanel.element.contains(target)) {
      return;
    }

    store.dispatch({ type: 'NORMALIZE_MATRIX' });
  },
  true
);

window.addEventListener('beforeunload', () => {
  window.clearInterval(autoStepIntervalId);
  setAutoStepRunning(false);
  graphPanel.destroy();
});

/**
 * Purpose: render function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function render() {
  const state = store.getState();
  graphPanel.render(state);
  statePanel.render(state);
  matrixPanel.render(state);
}

/**
 * Purpose: registerPanelInputGraphHighlighting function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function registerPanelInputGraphHighlighting(
  panelElement: HTMLElement,
  readTarget: (eventTarget: EventTarget | null) => GraphInteractionTarget | null
) {
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
    const target = readTarget(event.target);
    if (target) {
      graphPanel.setExternalFocusTarget(target);
    }
  });
}

/**
 * Purpose: readNodeTargetFromStateInput function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function readNodeTargetFromStateInput(eventTarget: EventTarget | null): GraphInteractionTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const input = eventTarget.closest<HTMLInputElement>('input[data-kind][data-index]');
  if (!input) {
    return null;
  }

  const nodeIndex = Number.parseInt(input.dataset.index ?? '', 10);
  if (!Number.isInteger(nodeIndex)) {
    return null;
  }

  return {
    kind: 'node',
    nodeIndex,
  };
}

/**
 * Purpose: readEdgeTargetFromMatrixInput function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function readEdgeTargetFromMatrixInput(eventTarget: EventTarget | null): GraphInteractionTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const input = eventTarget.closest<HTMLInputElement>('input[data-row-index][data-col-index]');
  if (!input) {
    return null;
  }

  const displayedRowIndex = Number.parseInt(input.dataset.rowIndex ?? '', 10);
  const displayedColIndex = Number.parseInt(input.dataset.colIndex ?? '', 10);
  // Matrix panel displays P^T, so displayed[row, col] maps to edge col -> row in internal P.
  const fromIndex = displayedColIndex;
  const toIndex = displayedRowIndex;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return null;
  }

  return {
    kind: 'edge',
    fromIndex,
    toIndex,
  };
}

/**
 * Purpose: createTopPanelNode function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
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
 * Purpose: createTemplateElement function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
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
 * Purpose: requireElement function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
