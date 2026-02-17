import type { Action } from './actions';
import type { AppState } from './types';
import { formatNodeLabelMarkup } from './node-label';
import { formatProbability } from '../lib/markov';

export type MatrixPanelController = {
  element: HTMLElement;
  render: (state: AppState) => void;
};

/**
 * Create the transition-matrix editor panel.
 */
export function createMatrixPanelController(options: {
  dispatch: (action: Action) => void;
}): MatrixPanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-matrix">
      <div class="markov-matrix-head">
        <div>
          <h2 class="base-panel-title">Transition Matrix P</h2>
          <p class="base-subtitle">
            Displayed as transpose: columns are outgoing probabilities from each state.
          </p>
        </div>
        <div class="markov-inline-actions">
          <button class="base-button base-button--secondary" type="button" data-action="normalize-matrix">
            Normalize all columns
          </button>
        </div>
      </div>

      <div class="markov-matrix-wrap" id="matrix-wrap"></div>
    </section>
  `);

  const matrixWrap = requireElement<HTMLDivElement>(element, '#matrix-wrap');

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    if (action === 'normalize-matrix') {
      options.dispatch({ type: 'NORMALIZE_MATRIX' });
    }
  });

  matrixWrap.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const displayedRowIndex = Number.parseInt(target.dataset.rowIndex ?? '', 10);
    const displayedColIndex = Number.parseInt(target.dataset.colIndex ?? '', 10);
    const value = Number.parseFloat(target.value);

    // Matrix is displayed as P^T, so displayed[row, col] maps to internal[col, row].
    options.dispatch({
      type: 'SET_TRANSITION_CELL',
      rowIndex: displayedColIndex,
      colIndex: displayedRowIndex,
      value,
    });
  });

  return {
    element,
    render(state) {
      matrixWrap.innerHTML = buildMatrixMarkup(state);
    },
  };
}

function buildMatrixMarkup(state: AppState): string {
  const columnHeaders = Array.from(
    { length: state.nodeCount },
    (_, index) => `<th scope="col">${formatNodeLabelMarkup(index)}</th>`
  ).join('');

  const bodyRows = Array.from({ length: state.nodeCount }, (_, displayedRowIndex) => {
    const rowCells = Array.from({ length: state.nodeCount }, (_, colIndex) => {
      const value = state.transitionMatrix[colIndex]?.[displayedRowIndex] ?? 0;
      return `
        <td>
          <input
            class="markov-number-input markov-number-input--matrix"
            type="number"
            min="0"
            max="1"
            step="0.01"
            data-row-index="${displayedRowIndex}"
            data-col-index="${colIndex}"
            value="${value.toFixed(4)}"
            aria-label="Transposed entry for transition probability from state ${colIndex + 1} to state ${displayedRowIndex + 1}"
          />
        </td>
      `;
    }).join('');

    return `
      <tr>
        <th scope="row">${formatNodeLabelMarkup(displayedRowIndex)}</th>
        ${rowCells}
      </tr>
    `;
  }).join('');

  const displayedColumnSums = Array.from({ length: state.nodeCount }, (_, displayedColIndex) => {
    // Displayed column sums of P^T correspond to internal row sums of P.
    return `<td class="markov-row-sum">${formatProbability(state.validation.rowSums[displayedColIndex], 4)}</td>`;
  }).join('');

  return `
    <table class="markov-matrix-table" aria-label="Transition matrix">
      <thead>
        <tr>
          <th scope="col">To \\ From</th>
          ${columnHeaders}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr>
          <th scope="row">Column sum</th>
          ${displayedColumnSums}
        </tr>
      </tbody>
    </table>
  `;
}

function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement for matrix panel.');
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
