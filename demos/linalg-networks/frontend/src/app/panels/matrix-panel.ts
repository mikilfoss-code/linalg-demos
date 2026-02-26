import { createTemplateElement, requireElement } from '@shared/lib/dom';
import type { NetworksBus } from '../events';
import type { NetworksState } from '../types';

export type MatrixPanelController = {
  element: HTMLElement;
  destroy: () => void;
};

/**
 * Create matrix panel for incidence matrix and rref displays.
 */
export function createMatrixPanelController(bus: NetworksBus): MatrixPanelController {
  const element = createTemplateElement<HTMLElement>(`
    <section class="base-panel networks-panel networks-panel-matrix">
      <h2 class="base-panel-title">Incidence Matrix and RREF</h2>
      <p class="networks-panel-subtitle">
        Rows are nodes, columns are directed edges, and each edge column has -1 at the tail and +1 at the head.
      </p>

      <div class="networks-matrix-grid">
        <section>
          <h3 class="networks-subheading">M</h3>
          <div id="incidence-matrix" class="networks-matrix-wrap"></div>
        </section>
        <section>
          <h3 class="networks-subheading">rref(M)</h3>
          <div id="rref-matrix" class="networks-matrix-wrap"></div>
        </section>
        <section>
          <h3 class="networks-subheading">rref(M^T)</h3>
          <div id="rref-transpose-matrix" class="networks-matrix-wrap"></div>
        </section>
      </div>
    </section>
  `);

  const incidenceEl = requireElement<HTMLElement>(element, '#incidence-matrix');
  const rrefEl = requireElement<HTMLElement>(element, '#rref-matrix');
  const rrefTransposeEl = requireElement<HTMLElement>(element, '#rref-transpose-matrix');

  const unsubscribe = bus.on('state:changed', (state) => {
    renderMatrixPanel(state);
  });

  return {
    element,
    destroy() {
      unsubscribe();
    },
  };

  function renderMatrixPanel(state: NetworksState): void {
    const edgeLabels = state.edges.map((_, index) => `e${index + 1}`);
    const nodeLabels = state.nodes.map((_, index) => `N${index + 1}`);
    const rrefRowLabels = state.derived.rrefMatrix.map((_, index) => `R${index + 1}`);
    const rrefTransposeRowLabels = state.derived.rrefTransposeMatrix.map((_, index) => `R${index + 1}`);

    incidenceEl.innerHTML = renderMatrixTable({
      matrix: state.derived.incidenceMatrix,
      rowLabels: nodeLabels,
      columnLabels: edgeLabels,
      emptyMessage: 'No incidence matrix yet. Add at least one edge.',
    });

    rrefEl.innerHTML = renderMatrixTable({
      matrix: state.derived.rrefMatrix,
      rowLabels: rrefRowLabels,
      columnLabels: edgeLabels,
      emptyMessage: 'No reduced matrix yet.',
    });

    rrefTransposeEl.innerHTML = renderMatrixTable({
      matrix: state.derived.rrefTransposeMatrix,
      rowLabels: rrefTransposeRowLabels,
      columnLabels: nodeLabels,
      emptyMessage: 'No reduced transpose matrix yet.',
    });
  }
}

function renderMatrixTable(options: {
  matrix: readonly (readonly number[])[];
  rowLabels: readonly string[];
  columnLabels: readonly string[];
  emptyMessage: string;
}): string {
  if (options.matrix.length === 0 || options.columnLabels.length === 0) {
    return `<p class="networks-empty">${options.emptyMessage}</p>`;
  }

  return `
    <table class="networks-matrix-table">
      <thead>
        <tr>
          <th scope="col"> </th>
          ${options.columnLabels.map((label) => `<th scope="col">${label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${options.matrix
          .map((row, rowIndex) => {
            const label = options.rowLabels[rowIndex] ?? `R${rowIndex + 1}`;
            return `
              <tr>
                <th scope="row">${label}</th>
                ${row.map((value) => `<td>${formatMatrixEntry(value)}</td>`).join('')}
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

function formatMatrixEntry(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-9) {
    return '0';
  }
  return value < 0 ? '-1' : '1';
}
