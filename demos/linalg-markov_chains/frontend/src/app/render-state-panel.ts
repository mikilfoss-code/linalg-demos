import type { Action } from './actions';
import type { AppState } from './types';
import { formatNodeLabelMarkup } from './node-label';

/**
 * Purpose: StatePanelController object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type StatePanelController = {
  element: HTMLElement;
  render: (state: AppState) => void;
  setAutoStepRunning: (running: boolean) => void;
};

/**
 * Create the right-side panel containing state vectors and step controls.
 */
export function createStatePanelController(options: {
  dispatch: (action: Action) => void;
  onToggleAutoStep: () => void;
}): StatePanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-state">
      <h2 class="base-panel-title">State Vectors</h2>
      <p class="base-subtitle">Edit x<sub>0</sub>, edit x<sub>t</sub>, and advance one Markov step at a time.</p>

      <div class="markov-step-row">
        <span class="markov-inline-heading">Step:</span>
        <button
          class="base-button base-button--secondary markov-inline-toggle"
          type="button"
          data-action="step"
          id="state-step-one-button"
        >
          One
        </button>
        <button
          class="base-button base-button--secondary markov-inline-toggle"
          type="button"
          data-action="toggle-auto-step"
          aria-pressed="false"
          id="state-toggle-auto-step-button"
        >
          Auto
        </button>
        <span class="markov-step-count-inline">
          Count:
          <strong id="step-count">0</strong>
        </span>
      </div>

      <div class="markov-step-row markov-step-row--initial">
        <span class="markov-inline-heading">Initial State:</span>
        <div class="markov-initial-actions">
          <button
            class="base-button base-button--secondary markov-initial-button"
            type="button"
            data-action="set-initial-uniform"
          >
            Uniform
          </button>
          <button
            class="base-button base-button--secondary markov-initial-button"
            type="button"
            data-action="set-initial-random"
          >
            Random
          </button>
          <button
            class="base-button base-button--secondary markov-initial-button"
            type="button"
            data-action="set-initial-current"
          >
            Current
          </button>
        </div>
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

      <p class="markov-error-list" id="validation-errors" role="status"></p>
    </section>
  `);

  const stateVectorBody = requireElement<HTMLTableSectionElement>(element, '#state-vector-body');
  const stepCountEl = requireElement<HTMLElement>(element, '#step-count');
  const validationErrorsEl = requireElement<HTMLElement>(element, '#validation-errors');
  const stepButton = requireElement<HTMLButtonElement>(element, '#state-step-one-button');
  const toggleAutoStepButton = requireElement<HTMLButtonElement>(
    element,
    '#state-toggle-auto-step-button'
  );
  let isAutoStepRunning = false;
  let highlightOneStepButton = false;
  let oneStepHighlightTimeoutId: number | null = null;
  updateControlButtonStyles();

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

  stateVectorBody.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (event.key !== 'Enter') return;

    const index = Number.parseInt(target.dataset.index ?? '', 10);
    const value = Number.parseFloat(target.value);

    if (target.dataset.kind === 'current') {
      event.preventDefault();
      options.dispatch({
        type: 'SET_CURRENT_CELL',
        index,
        value,
      });
      options.dispatch({ type: 'APPLY_CURRENT_AS_INITIAL_RESET' });
      return;
    }

    if (target.dataset.kind === 'initial') {
      event.preventDefault();
      options.dispatch({
        type: 'SET_INITIAL_CELL',
        index,
        value,
      });
      options.dispatch({ type: 'NORMALIZE_INITIAL_AND_RESET' });
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
        pulseOneStepButton();
        break;
      case 'toggle-auto-step':
        options.onToggleAutoStep();
        break;
      case 'set-initial-uniform':
        options.dispatch({ type: 'SET_INITIAL_UNIFORM' });
        break;
      case 'set-initial-random':
        options.dispatch({ type: 'SET_INITIAL_RANDOM' });
        break;
      case 'set-initial-current':
        options.dispatch({ type: 'SET_INITIAL_FROM_CURRENT' });
        break;
      default:
        break;
    }
  });

  return {
    element,
    setAutoStepRunning(running) {
      isAutoStepRunning = running;
      updateControlButtonStyles();
    },
    render(state) {
      stepCountEl.textContent = String(state.stepCount);

      stepButton.disabled = !state.validation.canStep && !state.hasPendingMatrixEdits;

      stateVectorBody.innerHTML = buildStateRowsMarkup(state);

      if (state.validation.errors.length > 0) {
        validationErrorsEl.textContent = state.validation.errors[0];
      } else {
        validationErrorsEl.textContent = '';
      }
    },
  };

  /**
   * Purpose: pulseOneStepButton function.
   * Inputs: Parameters declared in the function signature.
   * Returns: The value produced by this function.
   * Side effects: May update local state, shared state, or the DOM when applicable.
   */
  function pulseOneStepButton() {
    highlightOneStepButton = true;
    updateControlButtonStyles();

    if (oneStepHighlightTimeoutId !== null) {
      window.clearTimeout(oneStepHighlightTimeoutId);
    }
    oneStepHighlightTimeoutId = window.setTimeout(() => {
      highlightOneStepButton = false;
      oneStepHighlightTimeoutId = null;
      updateControlButtonStyles();
    }, 200);
  }

  /**
   * Purpose: updateControlButtonStyles function.
   * Inputs: Parameters declared in the function signature.
   * Returns: The value produced by this function.
   * Side effects: May update local state, shared state, or the DOM when applicable.
   */
  function updateControlButtonStyles() {
    stepButton.classList.toggle('is-active', highlightOneStepButton);
    toggleAutoStepButton.classList.toggle('is-active', isAutoStepRunning);
    toggleAutoStepButton.setAttribute('aria-pressed', isAutoStepRunning ? 'true' : 'false');
  }
}

/**
 * Purpose: buildStateRowsMarkup function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function buildStateRowsMarkup(state: AppState): string {
  return Array.from({ length: state.nodeCount }, (_, index) => {
    return `
      <tr>
        <th scope="row">${formatNodeLabelMarkup(index)}</th>
        <td>
          <input
            class="markov-number-input markov-number-input--state"
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
            class="markov-number-input markov-number-input--state"
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
    throw new Error('Expected a single root HTMLElement for state panel.');
  }
  return node;
}

/**
 * Purpose: requireElement function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
