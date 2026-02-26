import '@shared/ui/base-shell.css';
import './style.css';
import { createEventBus } from '@shared/lib/event-bus';
import { createStore } from '@shared/lib/store';
import { createTemplateElement, requireElement } from '@shared/lib/dom';
import { type LayoutNodeRenderOutput, type LayoutRendererRegistry } from '@shared/lib/layout-renderer';
import { mountResponsiveLayout } from '@shared/lib/layout-runtime';
import {
  NETWORKS_FALLBACK_VARIANTS,
  NETWORKS_LAYOUT_MODE,
  NETWORKS_LAYOUT_SCHEMA,
  type NetworksPanelId,
} from './layout-options';
import { createInitialState, reducer } from './app/reducer';
import type { NetworksEventMap } from './app/events';
import { createGraphPanelController } from './app/panels/graph-panel';
import { createFlowPanelController } from './app/panels/flow-panel';
import { createMatrixPanelController } from './app/panels/matrix-panel';
import { createSpacesPanelController } from './app/panels/spaces-panel';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app element');
}

root.innerHTML = `
  <div class="base-shell networks-shell">
    <header class="base-header">
      <div>
        <h1 class="base-title">Network Incidence Spaces Lab</h1>
        <p class="base-subtitle">
          Connect directed graphs to incidence matrices, edge flows, and the row/column/null spaces.
        </p>
      </div>
      <div class="networks-pill">Convention: rows = nodes, columns = edges, b = M f</div>
    </header>
    <section
      class="networks-layout"
      id="networks-layout-root"
    ></section>
  </div>
`;

const shell = requireElement<HTMLDivElement>(root, '.networks-shell');

const bus = createEventBus<NetworksEventMap>();
const store = createStore(createInitialState(), reducer);

const graphPanel = createGraphPanelController(bus);
const flowPanel = createFlowPanelController(bus);
const matrixPanel = createMatrixPanelController(bus);
const spacesPanel = createSpacesPanelController(bus);

const panelRegistry: LayoutRendererRegistry<NetworksPanelId> = {
  byPanelId: {
    top: () => createTopPanelNode(),
    controls: () => createTopLeftPanelNode(),
    graph: () => graphPanel.element,
    flow: () => flowPanel.element,
    bottom: () => createBottomPanelNode(),
    matrix: () => matrixPanel.element,
    spaces: () => spacesPanel.element,
  },
};

const layoutRoot = requireElement<HTMLDivElement>(root, '#networks-layout-root');
const responsiveLayout = mountResponsiveLayout({
  container: layoutRoot,
  tokenTarget: shell,
  schema: NETWORKS_LAYOUT_SCHEMA,
  preferredVariantId: NETWORKS_LAYOUT_MODE,
  fallbackVariant: NETWORKS_FALLBACK_VARIANTS[NETWORKS_LAYOUT_MODE],
  registry: panelRegistry,
});

const commandSubscriptions = [
  bus.on('command:add-node', () => {
    store.dispatch({ type: 'ADD_NODE' });
  }),
  bus.on('command:remove-node', () => {
    store.dispatch({ type: 'REMOVE_NODE' });
  }),
  bus.on('command:set-edge-draft-from', (payload) => {
    store.dispatch({ type: 'SET_EDGE_DRAFT_FROM', nodeId: payload.nodeId });
  }),
  bus.on('command:set-edge-draft-to', (payload) => {
    store.dispatch({ type: 'SET_EDGE_DRAFT_TO', nodeId: payload.nodeId });
  }),
  bus.on('command:add-edge', () => {
    store.dispatch({ type: 'ADD_EDGE' });
  }),
  bus.on('command:remove-edge', (payload) => {
    store.dispatch({ type: 'REMOVE_EDGE', edgeId: payload.edgeId });
  }),
  bus.on('command:set-edge-flow', (payload) => {
    store.dispatch({
      type: 'SET_EDGE_FLOW',
      edgeId: payload.edgeId,
      value: payload.value,
    });
  }),
  bus.on('command:select-basis', (payload) => {
    store.dispatch({
      type: 'SELECT_BASIS_VECTOR',
      space: payload.space,
      index: payload.index,
    });
  }),
];

const unsubscribeState = store.subscribe(() => {
  bus.emit('state:changed', store.getState());
});
bus.emit('state:changed', store.getState());

window.addEventListener('beforeunload', () => {
  unsubscribeState();
  commandSubscriptions.forEach((unsubscribe) => {
    unsubscribe();
  });
  graphPanel.destroy();
  flowPanel.destroy();
  matrixPanel.destroy();
  spacesPanel.destroy();
  responsiveLayout.destroy();
  bus.clear();
});

function createTopPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement<HTMLElement>(`
    <section class="networks-top-panel">
      <div class="networks-top-grid"></div>
    </section>
  `);
  return {
    element,
    childContainer: requireElement<HTMLElement>(element, '.networks-top-grid'),
  };
}

function createBottomPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement<HTMLElement>(`
    <section class="networks-bottom-panel">
      <div class="networks-bottom-grid"></div>
    </section>
  `);
  return {
    element,
    childContainer: requireElement<HTMLElement>(element, '.networks-bottom-grid'),
  };
}

function createTopLeftPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement<HTMLElement>(`
    <section class="networks-top-left-panel">
      <div class="networks-top-left-grid"></div>
    </section>
  `);
  return {
    element,
    childContainer: requireElement<HTMLElement>(element, '.networks-top-left-grid'),
  };
}
