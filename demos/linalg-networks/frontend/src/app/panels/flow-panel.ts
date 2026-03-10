import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  formatIndexedMathSymbol,
  formatMathNumber,
  mathTextClassName,
} from '@shared/lib/math-text';
import { queueStaticMathLabels } from '@shared/lib/mathjax';
import type { NetworksBus } from '../events';
import type { NetworksState } from '../types';
import { NETWORKS_MATH_TEXT_STYLE } from '../math-style';

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
        Edit edge flow vector
        <span
          class="networks-vector-name ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
        >f</span>.
        Node imbalance is computed as
        <span
          class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
          data-math-tex="\\mathbf{b} = \\mathbf{\\mathsf{M}}\\,\\mathbf{f}"
          data-math-fallback="b = M f"
        >b = M f</span>.
      </p>

      <div class="networks-vector-grid">
        <section>
          <h3 class="networks-subheading">
            Flow<span class="networks-vector-name networks-heading-symbol">f</span>
          </h3>
          <div id="flow-vector" class="networks-column-vector" aria-label="Edge flow column vector"></div>
        </section>
        <section>
          <h3 class="networks-subheading">
            Imbalance<span class="networks-vector-name networks-heading-symbol">b</span>
          </h3>
          <div id="imbalance-vector" class="networks-column-vector" aria-label="Node imbalance column vector"></div>
        </section>
      </div>
    </section>
  `);
  queueStaticMathLabels({
    root: element,
    style: NETWORKS_MATH_TEXT_STYLE,
  });

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

  const handleFlowInputActivated = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.vectorKind !== 'flow') {
      return;
    }
    // Defer selection to preserve override mode after pointer-driven focus.
    queueMicrotask(() => {
      if (document.activeElement === target) {
        target.select();
      }
    });
  };

  flowVectorEl.addEventListener('change', handleFlowInput);
  flowVectorEl.addEventListener('input', handleFlowInput);
  flowVectorEl.addEventListener('focusin', handleFlowInputActivated);
  flowVectorEl.addEventListener('click', handleFlowInputActivated);

  const unsubscribe = bus.on('state:changed', (state) => {
    renderFlowPanel(state);
  });

  return {
    element,
    destroy() {
      unsubscribe();
      flowVectorEl.removeEventListener('change', handleFlowInput);
      flowVectorEl.removeEventListener('input', handleFlowInput);
      flowVectorEl.removeEventListener('focusin', handleFlowInputActivated);
      flowVectorEl.removeEventListener('click', handleFlowInputActivated);
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
    <div class="networks-column-vector-frame networks-column-vector-frame--flow">
      <div class="networks-vector-label-column">
        ${state.edges
          .map((_, edgeIndex) => {
            const symbolLabel = formatIndexedMathSymbol({
              symbol: 'f',
              index: edgeIndex + 1,
              style: NETWORKS_MATH_TEXT_STYLE,
              mode: 'html',
            });
            return `
              <div class="networks-vector-label-row networks-scalar-symbol ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${symbolLabel}</div>
            `;
          })
          .join('')}
      </div>
      <div class="networks-vector-bracket networks-vector-bracket--values networks-vector-bracket--flow">
        ${state.edges
          .map((edge, edgeIndex) => {
            const ariaLabel = formatIndexedMathSymbol({
              symbol: 'f',
              index: edgeIndex + 1,
              style: NETWORKS_MATH_TEXT_STYLE,
            });
            return `
              <div class="networks-vector-entry-row">
                <input
                  id="flow-input-${edge.id}"
                  class="networks-number-input networks-number-input--flow"
                  type="number"
                  step="0.01"
                  value="${formatMathNumber(state.flowVector[edgeIndex] ?? 0, 2)}"
                  data-vector-kind="flow"
                  data-edge-id="${edge.id}"
                  aria-label="Flow value for ${ariaLabel}"
                />
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderImbalanceVector(state: NetworksState): string {
  if (state.nodes.length === 0) {
    return `<p class="networks-empty">No nodes in the graph.</p>`;
  }

  return `
    <div class="networks-column-vector-frame networks-column-vector-frame--imbalance">
      <div class="networks-vector-label-column">
        ${state.nodes
          .map((_, nodeIndex) => {
            const symbolLabel = formatIndexedMathSymbol({
              symbol: 'b',
              index: nodeIndex + 1,
              style: NETWORKS_MATH_TEXT_STYLE,
              mode: 'html',
            });
            return `
              <div class="networks-vector-label-row networks-scalar-symbol ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${symbolLabel}</div>
            `;
          })
          .join('')}
      </div>
      <div class="networks-vector-bracket networks-vector-bracket--values networks-vector-bracket--imbalance">
        ${state.nodes
          .map((_, nodeIndex) => {
            const imbalance = state.derived.imbalanceVector[nodeIndex] ?? 0;
            return `
              <div class="networks-vector-entry-row networks-vector-entry-row--readonly">
                <span class="networks-vector-value ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatMathNumber(imbalance, 2)}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}
