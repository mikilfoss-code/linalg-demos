import type { Action } from './actions';
import type { AppState } from './types';
import { formatProbability, MAX_NODE_COUNT, MIN_NODE_COUNT } from '../lib/markov';

export type StatePanelController = {
  element: HTMLElement;
  render: (state: AppState) => void;
};

/**
 * Create the right-side panel containing state vectors, controls, and backend analysis.
 */
export function createStatePanelController(options: {
  dispatch: (action: Action) => void;
  onAnalyze: () => void;
}): StatePanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-state">
      <h2 class="base-panel-title">State Vectors</h2>
      <p class="base-subtitle">Edit x<sub>0</sub>, edit x<sub>t</sub>, and advance one Markov step at a time.</p>

      <div class="markov-controls-block">
        <label class="markov-control-label" for="node-count-range">Node count</label>
        <div class="markov-node-count-controls">
          <input
            id="node-count-range"
            type="range"
            min="${MIN_NODE_COUNT}"
            max="${MAX_NODE_COUNT}"
            step="1"
          />
          <input
            id="node-count-number"
            type="number"
            min="${MIN_NODE_COUNT}"
            max="${MAX_NODE_COUNT}"
            step="1"
          />
        </div>
      </div>

      <div class="markov-step-controls">
        <button class="base-button" type="button" data-action="step">Step: x<sub>t+1</sub> = x<sub>t</sub>P</button>
        <button class="base-button base-button--secondary" type="button" data-action="reset">Reset to x<sub>0</sub></button>
      </div>

      <div class="markov-meta-line">
        <span>Step count:</span>
        <strong id="step-count">0</strong>
      </div>

      <div class="markov-state-table-wrap">
        <table class="markov-state-table" aria-label="State vectors">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">x<sub>0</sub></th>
              <th scope="col">x<sub>t</sub></th>
            </tr>
          </thead>
          <tbody id="state-vector-body"></tbody>
        </table>
      </div>

      <div class="markov-inline-actions">
        <button class="base-button base-button--secondary" type="button" data-action="normalize-initial">Normalize x<sub>0</sub></button>
        <button class="base-button base-button--secondary" type="button" data-action="normalize-current">Normalize x<sub>t</sub></button>
      </div>

      <div class="markov-meta-line">
        <span>sum(x<sub>0</sub>):</span>
        <strong id="initial-sum">1.000</strong>
      </div>
      <div class="markov-meta-line">
        <span>sum(x<sub>t</sub>):</span>
        <strong id="current-sum">1.000</strong>
      </div>

      <div class="markov-analysis" aria-live="polite">
        <div class="markov-analysis-head">
          <h3>Backend Analysis</h3>
          <button class="base-button" type="button" data-action="analyze">Analyze</button>
        </div>
        <p class="markov-analysis-status" id="analysis-status">Ready to analyze.</p>
        <pre class="markov-analysis-output" id="analysis-output">No analysis yet.</pre>
      </div>

      <p class="markov-error-list" id="validation-errors" role="status"></p>
    </section>
  `);

  const nodeCountRange = requireElement<HTMLInputElement>(element, '#node-count-range');
  const nodeCountNumber = requireElement<HTMLInputElement>(element, '#node-count-number');
  const stateVectorBody = requireElement<HTMLTableSectionElement>(element, '#state-vector-body');
  const stepCountEl = requireElement<HTMLElement>(element, '#step-count');
  const initialSumEl = requireElement<HTMLElement>(element, '#initial-sum');
  const currentSumEl = requireElement<HTMLElement>(element, '#current-sum');
  const validationErrorsEl = requireElement<HTMLElement>(element, '#validation-errors');
  const analysisStatusEl = requireElement<HTMLElement>(element, '#analysis-status');
  const analysisOutputEl = requireElement<HTMLPreElement>(element, '#analysis-output');
  const stepButton = requireElement<HTMLButtonElement>(element, '[data-action="step"]');
  const analyzeButton = requireElement<HTMLButtonElement>(element, '[data-action="analyze"]');

  nodeCountRange.addEventListener('input', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.dispatch({ type: 'SET_NODE_COUNT', nodeCount: value });
  });

  nodeCountNumber.addEventListener('change', (event) => {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    options.dispatch({ type: 'SET_NODE_COUNT', nodeCount: value });
  });

  stateVectorBody.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const index = Number.parseInt(target.dataset.index ?? '', 10);
    const value = Number.parseFloat(target.value);

    if (target.dataset.kind === 'initial') {
      options.dispatch({
        type: 'SET_INITIAL_CELL',
        index,
        value,
      });
      return;
    }

    if (target.dataset.kind === 'current') {
      options.dispatch({
        type: 'SET_CURRENT_CELL',
        index,
        value,
      });
    }
  });

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    switch (action) {
      case 'step':
        options.dispatch({ type: 'STEP' });
        break;
      case 'reset':
        options.dispatch({ type: 'RESET_TO_INITIAL' });
        break;
      case 'normalize-initial':
        options.dispatch({ type: 'NORMALIZE_INITIAL_VECTOR' });
        break;
      case 'normalize-current':
        options.dispatch({ type: 'NORMALIZE_CURRENT_VECTOR' });
        break;
      case 'analyze':
        options.onAnalyze();
        break;
      default:
        break;
    }
  });

  return {
    element,
    render(state) {
      nodeCountRange.value = String(state.nodeCount);
      nodeCountNumber.value = String(state.nodeCount);
      stepCountEl.textContent = String(state.stepCount);
      initialSumEl.textContent = formatProbability(state.validation.initialVectorSum);
      currentSumEl.textContent = formatProbability(state.validation.currentVectorSum);

      stepButton.disabled = !state.validation.canStep;
      analyzeButton.disabled = !state.validation.canAnalyze || state.analysis.status === 'loading';

      stateVectorBody.innerHTML = buildStateRowsMarkup(state);

      if (state.validation.errors.length > 0) {
        validationErrorsEl.textContent = state.validation.errors[0];
      } else {
        validationErrorsEl.textContent = '';
      }

      if (state.analysis.status === 'loading') {
        analysisStatusEl.textContent = 'Analyzing transition behavior...';
        analysisOutputEl.textContent = 'Working...';
      } else if (state.analysis.status === 'error') {
        analysisStatusEl.textContent = 'Analysis failed.';
        analysisOutputEl.textContent = state.analysis.errorMessage ?? 'Unknown error.';
      } else if (state.analysis.status === 'success' && state.analysis.result) {
        const result = state.analysis.result;
        analysisStatusEl.textContent = `Spectral gap: ${
          result.spectralGap === null ? 'n/a' : formatProbability(result.spectralGap, 4)
        }`;
        const eigenSummary = result.eigenvalues
          .slice(0, 4)
          .map(
            (eigenvalue, index) =>
              `lambda${index + 1} = ${formatProbability(eigenvalue.real, 4)} + ${formatProbability(
                eigenvalue.imag,
                4
              )}i |lambda|=${formatProbability(eigenvalue.magnitude, 4)}`
          )
          .join('\n');

        analysisOutputEl.textContent = [
          `row sums: [${result.rowSums.map((value) => formatProbability(value, 4)).join(', ')}]`,
          `next x:    [${result.nextVector.map((value) => formatProbability(value, 4)).join(', ')}]`,
          `stationary:[${result.stationaryDistribution
            .map((value) => formatProbability(value, 4))
            .join(', ')}]`,
          `residual: ${formatProbability(result.stationaryResidual, 6)}`,
          eigenSummary,
        ].join('\n');
      } else {
        analysisStatusEl.textContent = 'Ready to analyze.';
        analysisOutputEl.textContent = 'No analysis yet.';
      }
    },
  };
}

function buildStateRowsMarkup(state: AppState): string {
  return Array.from({ length: state.nodeCount }, (_, index) => {
    return `
      <tr>
        <th scope="row">S${index + 1}</th>
        <td>
          <input
            class="markov-number-input"
            data-kind="initial"
            data-index="${index}"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value="${state.initialVector[index].toFixed(4)}"
            aria-label="Initial probability for state ${index + 1}"
          />
        </td>
        <td>
          <input
            class="markov-number-input"
            data-kind="current"
            data-index="${index}"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value="${state.currentVector[index].toFixed(4)}"
            aria-label="Current probability for state ${index + 1}"
          />
        </td>
      </tr>
    `;
  }).join('');
}

function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement for state panel.');
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
