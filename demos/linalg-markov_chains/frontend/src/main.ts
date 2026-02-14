import '@shared/ui/base-shell.css';
import './style.css';
import {
  renderLayoutPlan,
  type LayoutNodeRenderOutput,
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import { applyLayoutTokens } from '@shared/lib/layout-runtime';
import { createGraphPanelController } from './app/render-graph';
import { createMatrixPanelController } from './app/render-matrix-panel';
import { createStatePanelController } from './app/render-state-panel';
import { reducer, createInitialState } from './app/reducer';
import { createStore } from './app/store';
import { analyzeMarkov, getApiBaseUrl } from './lib/api';
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
          Build a chain with up to 6 states, inspect x<sub>t</sub>, and animate probability flow along directed edges.
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

let analyzeRequestToken = 0;

const graphPanel = createGraphPanelController({
  onFlowAnimationComplete(animationId) {
    store.dispatch({ type: 'CLEAR_FLOW_ANIMATION', animationId });
  },
});

const statePanel = createStatePanelController({
  dispatch: store.dispatch,
  onAnalyze() {
    void runAnalysis();
  },
});

const matrixPanel = createMatrixPanelController({
  dispatch: store.dispatch,
});

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

window.addEventListener('beforeunload', () => {
  graphPanel.destroy();
});

async function runAnalysis(): Promise<void> {
  const snapshot = store.getState();
  if (!snapshot.validation.canAnalyze) {
    return;
  }

  const requestToken = analyzeRequestToken + 1;
  analyzeRequestToken = requestToken;

  store.dispatch({ type: 'ANALYZE_REQUEST' });
  const result = await analyzeMarkov({
    transitionMatrix: snapshot.transitionMatrix,
    initialVector: snapshot.initialVector,
    currentVector: snapshot.currentVector,
  });

  if (requestToken !== analyzeRequestToken) {
    return;
  }

  if (!result.ok) {
    store.dispatch({ type: 'ANALYZE_ERROR', message: result.error.message });
    return;
  }

  store.dispatch({ type: 'ANALYZE_SUCCESS', result: result.value });
}

function render() {
  const state = store.getState();
  graphPanel.render(state);
  statePanel.render(state);
  matrixPanel.render(state);
}

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

function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement.');
  }
  return node;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
