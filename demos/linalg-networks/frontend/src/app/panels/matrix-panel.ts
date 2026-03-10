import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  formatIndexedMathSymbol,
  mathTextClassName,
} from '@shared/lib/math-text';
import type { NetworksBus } from '../events';
import type { NetworksState } from '../types';
import { NETWORKS_MATH_TEXT_STYLE } from '../math-style';

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
        Rows are nodes, columns are directed edges, and each edge column has
        <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">-1</span>
        at the tail and
        <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">+1</span>
        at the head.
      </p>

      <div class="networks-matrix-grid">
        <section>
          <h3 class="networks-subheading">
            <span class="networks-matrix-heading">M</span>
          </h3>
          <div id="incidence-matrix" class="networks-matrix-wrap"></div>
        </section>
        <section>
          <h3 class="networks-subheading">
            <span class="networks-matrix-heading">rref(M)</span>
          </h3>
          <div id="rref-matrix" class="networks-matrix-wrap"></div>
        </section>
        <section>
          <h3 class="networks-subheading">
            <span class="networks-matrix-heading">rref(M<sup>T</sup>)</span>
          </h3>
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
    const edgeLabels = state.edges.map((_, index) =>
      `<span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
        symbol: 'e',
        index: index + 1,
        style: NETWORKS_MATH_TEXT_STYLE,
        mode: 'html',
      })}</span>`
    );
    const nodeLabels = state.nodes.map((_, index) =>
      `<span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
        symbol: 'N',
        index: index + 1,
        style: NETWORKS_MATH_TEXT_STYLE,
        mode: 'html',
      })}</span>`
    );
    const rrefRowLabels = state.derived.rrefMatrix.map((_, index) =>
      `<span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
        symbol: 'R',
        index: index + 1,
        style: NETWORKS_MATH_TEXT_STYLE,
        mode: 'html',
      })}</span>`
    );
    const rrefTransposeRowLabels = state.derived.rrefTransposeMatrix.map((_, index) =>
      `<span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
        symbol: 'R',
        index: index + 1,
        style: NETWORKS_MATH_TEXT_STYLE,
        mode: 'html',
      })}</span>`
    );

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
            const label =
              options.rowLabels[rowIndex] ??
              `<span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
                symbol: 'R',
                index: rowIndex + 1,
                style: NETWORKS_MATH_TEXT_STYLE,
                mode: 'html',
              })}</span>`;
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
