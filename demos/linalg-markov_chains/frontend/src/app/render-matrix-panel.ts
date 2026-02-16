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
          <p class="base-subtitle">Each row defines outgoing probabilities from one state.</p>
        </div>
        <div class="markov-inline-actions">
          <button class="base-button base-button--secondary" type="button" data-action="normalize-matrix">
            Normalize all rows
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

    const rowIndex = Number.parseInt(target.dataset.rowIndex ?? '', 10);
    const colIndex = Number.parseInt(target.dataset.colIndex ?? '', 10);
    const value = Number.parseFloat(target.value);

    options.dispatch({
      type: 'SET_TRANSITION_CELL',
      rowIndex,
      colIndex,
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

  const bodyRows = Array.from({ length: state.nodeCount }, (_, rowIndex) => {
    const rowCells = Array.from({ length: state.nodeCount }, (_, colIndex) => {
      const value = state.transitionMatrix[rowIndex][colIndex];
      return `
        <td>
          <input
            class="markov-number-input markov-number-input--matrix"
            type="number"
            min="0"
            max="1"
            step="0.01"
            data-row-index="${rowIndex}"
            data-col-index="${colIndex}"
            value="${value.toFixed(4)}"
            aria-label="Transition probability from state ${rowIndex + 1} to state ${colIndex + 1}"
          />
        </td>
      `;
    }).join('');

    return `
      <tr>
        <th scope="row">${formatNodeLabelMarkup(rowIndex)}</th>
        ${rowCells}
        <td class="markov-row-sum">${formatProbability(state.validation.rowSums[rowIndex], 4)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="markov-matrix-table" aria-label="Transition matrix">
      <thead>
        <tr>
          <th scope="col">From \\ To</th>
          ${columnHeaders}
          <th scope="col">Row sum</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
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
