import { createTemplateElement, requireElement } from '@shared/lib/dom';
import type { NetworksBus } from '../events';
import type { NetworksState } from '../types';

export type FlowPanelController = {
  element: HTMLElement;
  destroy: () => void;
};

/**
 * Create vector panel for editing edge flow and viewing node imbalance.
 */
export function createFlowPanelController(bus: NetworksBus): FlowPanelController {
  const element = createTemplateElement<HTMLElement>(`
    <section class="base-panel networks-panel networks-panel-flow">
      <h2 class="base-panel-title">Flow and Imbalance Vectors</h2>
      <p class="networks-panel-subtitle">
        Edit edge flow vector <code>f</code>. Node imbalance is computed as <code>b = M f</code>.
      </p>

      <div class="networks-vector-grid">
        <section>
          <h3 class="networks-subheading">Flow vector f</h3>
          <div id="flow-vector" class="networks-column-vector" aria-label="Edge flow column vector"></div>
        </section>
        <section>
          <h3 class="networks-subheading">Imbalance vector b</h3>
          <div id="imbalance-vector" class="networks-column-vector" aria-label="Node imbalance column vector"></div>
        </section>
      </div>
    </section>
  `);

  const flowVectorEl = requireElement<HTMLElement>(element, '#flow-vector');
  const imbalanceVectorEl = requireElement<HTMLElement>(element, '#imbalance-vector');

  const handleFlowInput = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.vectorKind !== 'flow') {
      return;
    }
    const edgeId = target.dataset.edgeId;
    if (!edgeId) {
      return;
    }
    const parsed = Number.parseFloat(target.value);
    bus.emit('command:set-edge-flow', {
      edgeId,
      value: Number.isFinite(parsed) ? parsed : 0,
    });
  };

  flowVectorEl.addEventListener('change', handleFlowInput);
  flowVectorEl.addEventListener('input', handleFlowInput);

  const unsubscribe = bus.on('state:changed', (state) => {
    renderFlowPanel(state);
  });

  return {
    element,
    destroy() {
      unsubscribe();
      flowVectorEl.removeEventListener('change', handleFlowInput);
      flowVectorEl.removeEventListener('input', handleFlowInput);
    },
  };

  function renderFlowPanel(state: NetworksState): void {
    flowVectorEl.innerHTML = renderFlowVector(state);
    imbalanceVectorEl.innerHTML = renderImbalanceVector(state);
  }
}

function renderFlowVector(state: NetworksState): string {
  if (state.edges.length === 0) {
    return `<p class="networks-empty">Add an edge to define flow components.</p>`;
  }

  return `
    <div class="networks-vector-bracket">
      ${state.edges
        .map((edge, edgeIndex) => {
          return `
            <label class="networks-vector-row" for="flow-input-${edge.id}">
              <span class="networks-vector-label">f${edgeIndex + 1}</span>
              <input
                id="flow-input-${edge.id}"
                class="networks-number-input"
                type="number"
                step="0.01"
                value="${formatNumber(state.flowVector[edgeIndex] ?? 0)}"
                data-vector-kind="flow"
                data-edge-id="${edge.id}"
                aria-label="Flow value for edge ${edgeIndex + 1}"
              />
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderImbalanceVector(state: NetworksState): string {
  if (state.nodes.length === 0) {
    return `<p class="networks-empty">No nodes in the graph.</p>`;
  }

  return `
    <div class="networks-vector-bracket">
      ${state.nodes
        .map((_, nodeIndex) => {
          const imbalance = state.derived.imbalanceVector[nodeIndex] ?? 0;
          return `
            <div class="networks-vector-row networks-vector-row--readonly">
              <span class="networks-vector-label">b${nodeIndex + 1}</span>
              <span class="networks-vector-value">${formatNumber(imbalance)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}
