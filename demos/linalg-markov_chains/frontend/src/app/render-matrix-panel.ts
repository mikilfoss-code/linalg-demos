import type { Action } from './actions';
import type { EditTarget } from './edit-session';
import type { PanelRenderContext, PanelScopeMode } from './panel-context';
import { selectDisplayedTransitionCell } from './selectors';
import type { AppState } from './types';
import { formatNodeLabelMarkup } from './node-label';
import {
  formatEditableInputValue,
  moveCaretToEnd,
  readNonNegativeDraftInputValue,
  shouldUseDestructiveOverwrite,
} from './edit-value-input';
import { createTemplateElement, requireElement } from './dom-helpers';
import {
  alignWindowStartToIncludeIndex,
  clamp01,
  clampWindowStart,
  colorForPanelBlue,
  colorForPanelRed,
  formatWindowRange,
  graphTargetKey,
  resolveScopedNodeIndices,
  toStyleAttribute,
} from './panel-shared';
import type { GraphInteractionTarget } from './graph-interaction-presenter';

const MATRIX_ROW_WINDOW_SIZE = 8;
const MATRIX_COL_WINDOW_SIZE = 10;
const PROBABILITY_EPSILON = 1e-6;

/**
 * Purpose: MatrixPanelController object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type MatrixPanelController = {
  element: HTMLElement;
  render: (state: AppState, context: PanelRenderContext) => void;
};

/**
 * Create the transition-matrix editor panel.
 */
export function createMatrixPanelController(options: {
  dispatch: (action: Action) => void;
  onSetScopeMode: (mode: PanelScopeMode) => void;
}): MatrixPanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-matrix">
      <div class="markov-matrix-head">
        <div>
          <h2 class="base-panel-title">Transition Matrix P</h2>
        </div>
        <div class="markov-inline-actions">
          <div class="markov-scope-toggle" role="group" aria-label="Matrix and state panel scope">
            <button
              class="base-button base-button--secondary markov-scope-toggle-button"
              type="button"
              data-action="set-scope-full"
              id="matrix-scope-full-button"
            >
              Full extracted
            </button>
            <button
              class="base-button base-button--secondary markov-scope-toggle-button"
              type="button"
              data-action="set-scope-visible"
              id="matrix-scope-visible-button"
            >
              Visible only
            </button>
          </div>
          <button
            class="base-button base-button--secondary"
            type="button"
            data-action="normalize-matrix"
            id="matrix-normalize-button"
          >
            Normalize all columns
          </button>
        </div>
      </div>

      <div class="markov-matrix-stage">
        <div class="markov-matrix-col-slider-wrap" id="matrix-col-slider-wrap">
          <div class="markov-matrix-col-slider-row">
            <label class="markov-control-label" for="matrix-col-slider">Columns</label>
            <input
              class="markov-window-slider"
              id="matrix-col-slider"
              type="range"
              min="0"
              max="0"
              step="1"
              value="0"
            />
          </div>
          <span class="markov-window-range-label" id="matrix-col-window-label">1-1 / 1</span>
        </div>
        <div class="markov-matrix-main">
          <div class="markov-matrix-row-slider-wrap" id="matrix-row-slider-wrap">
            <label class="markov-control-label" for="matrix-row-slider">Rows</label>
            <input
              class="markov-window-slider markov-window-slider--vertical"
              id="matrix-row-slider"
              type="range"
              min="0"
              max="0"
              step="1"
              value="0"
            />
            <span class="markov-window-range-label" id="matrix-row-window-label">1-1 / 1</span>
          </div>
          <div class="markov-matrix-wrap" id="matrix-wrap"></div>
        </div>
      </div>
    </section>
  `);

  const matrixWrap = requireElement<HTMLDivElement>(element, '#matrix-wrap');
  const matrixRowSliderWrap = requireElement<HTMLDivElement>(element, '#matrix-row-slider-wrap');
  const matrixColSliderWrap = requireElement<HTMLDivElement>(element, '#matrix-col-slider-wrap');
  const matrixRowSlider = requireElement<HTMLInputElement>(element, '#matrix-row-slider');
  const matrixColSlider = requireElement<HTMLInputElement>(element, '#matrix-col-slider');
  const matrixRowWindowLabel = requireElement<HTMLElement>(element, '#matrix-row-window-label');
  const matrixColWindowLabel = requireElement<HTMLElement>(element, '#matrix-col-window-label');
  const matrixScopeFullButton = requireElement<HTMLButtonElement>(
    element,
    '#matrix-scope-full-button'
  );
  const matrixScopeVisibleButton = requireElement<HTMLButtonElement>(
    element,
    '#matrix-scope-visible-button'
  );
  const matrixNormalizeButton = requireElement<HTMLButtonElement>(
    element,
    '#matrix-normalize-button'
  );

  let rowWindowStart = 0;
  let colWindowStart = 0;
  let activeRowWindowSize = MATRIX_ROW_WINDOW_SIZE;
  let activeColWindowSize = MATRIX_COL_WINDOW_SIZE;
  let showRowSlider = false;
  let showColSlider = false;
  let pendingFocusCell: { fromIndex: number; toIndex: number; armOverwrite: boolean } | null =
    null;
  let focusedMatrixInput: HTMLInputElement | null = null;
  let overwriteArmedMatrixInput: HTMLInputElement | null = null;
  let lastRenderedState: AppState | null = null;
  let lastRenderedContext: PanelRenderContext | null = null;
  let lastAutoScrolledSelectedTargetKey: string | null = null;

  element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    if (action === 'normalize-matrix') {
      if (lastRenderedState?.sourceMode === 'manual') {
        commitTransitionDraftsAndNormalize('normalize_button');
      }
      return;
    }

    if (action === 'set-scope-full') {
      options.onSetScopeMode('full-extracted');
      return;
    }

    if (action === 'set-scope-visible') {
      options.onSetScopeMode('visible-only');
    }
  });

  matrixWrap.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('markov-number-input--matrix')) return;
    if (!isMatrixEditable()) return;
    const fromIndex = Number.parseInt(target.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(target.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return;
    }
    const draft = readNonNegativeDraftInputValue(target);
    if (!draft.shouldDispatch || draft.value === null) {
      return;
    }
    pendingFocusCell = {
      fromIndex,
      toIndex,
      armOverwrite: false,
    };
    options.dispatch({
      type: 'EDIT_CHANGE_VALUE',
      target: {
        kind: 'edge',
        fromIndex,
        toIndex,
      },
      value: draft.value,
    });
  });

  matrixWrap.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.classList.contains('markov-number-input--matrix')) {
      return;
    }
    if (isMatrixEditable()) {
      const edgeTarget = readEdgeTargetFromInput(target);
      if (edgeTarget) {
        dispatchMatrixEditFocus(edgeTarget, 'focus');
      }
    }
    armInputForDestructiveEntry(target);
    focusedMatrixInput = target;
    updateFocusedInputCaretTone(event.target);
  });

  matrixWrap.addEventListener('focusout', (event) => {
    if (!(event instanceof FocusEvent)) {
      return;
    }
    const related = event.relatedTarget;
    if (
      related instanceof HTMLInputElement &&
      related.classList.contains('markov-number-input--matrix')
    ) {
      return;
    }
    if (focusedMatrixInput) {
      focusedMatrixInput.classList.remove('markov-input-caret-red', 'markov-input-caret-blue');
    }
    overwriteArmedMatrixInput = null;
    focusedMatrixInput = null;
  });

  matrixWrap.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.classList.contains('markov-number-input--matrix')) {
      return;
    }
    const isAlreadyActiveInput = document.activeElement === target;
    if (isMatrixEditable()) {
      const edgeTarget = readEdgeTargetFromInput(target);
      if (edgeTarget && !isAlreadyActiveInput) {
        dispatchMatrixEditFocus(edgeTarget, 'click');
      }
    }
    if (isAlreadyActiveInput) {
      if (overwriteArmedMatrixInput === target) {
        disarmInputForInsertMode(target);
      } else {
        armInputForDestructiveEntry(target);
      }
    } else {
      armInputForDestructiveEntry(target);
    }
    focusedMatrixInput = target;
    updateFocusedInputCaretTone(target);
  });

  matrixWrap.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('markov-number-input--matrix')) return;
    if (!isMatrixEditable()) return;

    const fromIndex = Number.parseInt(target.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(target.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        focusFirstMatrixInput();
        ensureMatrixTabFocusWithinPanel(target);
      }
      return;
    }

    if (overwriteArmedMatrixInput === target && shouldUseDestructiveOverwrite(event)) {
      target.value = '';
      overwriteArmedMatrixInput = null;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const draft = readNonNegativeDraftInputValue(target, {
        deferTrailingDecimal: false,
        deferZeroOnlyFraction: false,
      });
      if (draft.value !== null) {
        options.dispatch({
          type: 'EDIT_CHANGE_VALUE',
          target: {
            kind: 'edge',
            fromIndex,
            toIndex,
          },
          value: draft.value,
        });
      }
      overwriteArmedMatrixInput = null;
      target.blur();
      commitTransitionDraftsAndNormalize('enter');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelMatrixEditing('escape');
      overwriteArmedMatrixInput = null;
      target.blur();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const draft = readNonNegativeDraftInputValue(target, {
      deferTrailingDecimal: false,
      deferZeroOnlyFraction: false,
    });
    if (draft.value !== null) {
      options.dispatch({
        type: 'EDIT_CHANGE_VALUE',
        target: {
          kind: 'edge',
          fromIndex,
          toIndex,
        },
        value: draft.value,
      });
    }
    options.dispatch({
      type: 'EDIT_TAB_NAVIGATE',
      panel: 'matrix',
      reverse: event.shiftKey,
    });
    overwriteArmedMatrixInput = null;
    focusNextMatrixInputByColumn({
      fromIndex,
      toIndex,
      reverse: event.shiftKey,
    });
    ensureMatrixTabFocusWithinPanel(target);
  });

  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) {
      return;
    }
    if (!isMatrixEditable()) {
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) {
      return;
    }
    if (!active.classList.contains('markov-number-input--matrix')) {
      return;
    }
    if (!matrixWrap.contains(active)) {
      return;
    }
    const fromIndex = Number.parseInt(active.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(active.dataset.toIndex ?? '', 10);
    event.preventDefault();
    event.stopPropagation();
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      focusFirstMatrixInput();
      ensureMatrixTabFocusWithinPanel(active);
      return;
    }
    options.dispatch({
      type: 'EDIT_TAB_NAVIGATE',
      panel: 'matrix',
      reverse: event.shiftKey,
    });
    overwriteArmedMatrixInput = null;
    focusNextMatrixInputByColumn({
      fromIndex,
      toIndex,
      reverse: event.shiftKey,
    });
    ensureMatrixTabFocusWithinPanel(active);
  });

  const handleWindowPointerDown = (event: PointerEvent) => {
    if (!isMatrixEditingSessionActive() && !focusedMatrixInput) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-action="normalize-matrix"]')) {
      return;
    }
    if (focusedMatrixInput && target === focusedMatrixInput) {
      return;
    }
    if (element.contains(target)) {
      return;
    }
    cancelMatrixEditing('outside_click');
    if (focusedMatrixInput && focusedMatrixInput.isConnected) {
      focusedMatrixInput.blur();
    }
  };
  window.addEventListener('pointerdown', handleWindowPointerDown, true);

  element.addEventListener('pointermove', (event) => {
    updateFocusedInputCaretTone(event.target);
  });

  element.addEventListener('pointerleave', () => {
    updateFocusedInputCaretTone(null);
  });

  matrixRowSlider.addEventListener('input', () => {
    rowWindowStart = Number.parseInt(matrixRowSlider.value, 10) || 0;
    renderFromCache();
  });

  matrixColSlider.addEventListener('input', () => {
    colWindowStart = Number.parseInt(matrixColSlider.value, 10) || 0;
    renderFromCache();
  });

  return {
    element,
    render(state, context) {
      lastRenderedState = state;
      lastRenderedContext = context;

      const scopedNodeIndices = resolveScopedNodeIndices(context);
      const selectedTargetKey = graphTargetKey(context.selectedTarget);
      if (selectedTargetKey && selectedTargetKey !== lastAutoScrolledSelectedTargetKey) {
        autoScrollWindowsToSelectedTarget(context.selectedTarget, scopedNodeIndices);
      }
      lastAutoScrolledSelectedTargetKey = selectedTargetKey;

      const isMatrixEditable = state.sourceMode === 'manual';
      const hasColOverflow = measureMatrixColumnOverflow({
        state,
        context,
        scopedNodeIndices,
        editable: isMatrixEditable,
      });
      showRowSlider = scopedNodeIndices.length > MATRIX_ROW_WINDOW_SIZE;
      showColSlider = hasColOverflow;
      activeRowWindowSize = showRowSlider
        ? Math.min(MATRIX_ROW_WINDOW_SIZE, scopedNodeIndices.length)
        : scopedNodeIndices.length;
      activeColWindowSize = showColSlider
        ? Math.min(MATRIX_COL_WINDOW_SIZE, scopedNodeIndices.length)
        : scopedNodeIndices.length;
      if (!showRowSlider) {
        rowWindowStart = 0;
      }
      if (!showColSlider) {
        colWindowStart = 0;
      }

      const rowWindowLimit = Math.max(0, scopedNodeIndices.length - activeRowWindowSize);
      const colWindowLimit = Math.max(0, scopedNodeIndices.length - activeColWindowSize);
      rowWindowStart = clampWindowStart(rowWindowStart, rowWindowLimit);
      colWindowStart = clampWindowStart(colWindowStart, colWindowLimit);
      matrixRowSliderWrap.hidden = !showRowSlider;
      matrixColSliderWrap.hidden = !showColSlider;

      matrixRowSlider.max = String(rowWindowLimit);
      matrixRowSlider.value = String(rowWindowStart);
      matrixRowSlider.disabled = !showRowSlider || rowWindowLimit <= 0;
      matrixRowWindowLabel.textContent = formatWindowRange(
        rowWindowStart,
        activeRowWindowSize,
        scopedNodeIndices.length
      );

      matrixColSlider.max = String(colWindowLimit);
      matrixColSlider.value = String(colWindowStart);
      matrixColSlider.disabled = !showColSlider || colWindowLimit <= 0;
      matrixColWindowLabel.textContent = formatWindowRange(
        colWindowStart,
        activeColWindowSize,
        scopedNodeIndices.length
      );

      matrixNormalizeButton.disabled = !isMatrixEditable;
      matrixNormalizeButton.title = isMatrixEditable
        ? 'Normalize all matrix columns.'
        : 'Dataset matrix values are read-only.';

      matrixScopeFullButton.classList.toggle('is-active', context.scopeMode === 'full-extracted');
      matrixScopeVisibleButton.classList.toggle('is-active', context.scopeMode === 'visible-only');
      matrixScopeFullButton.setAttribute(
        'aria-pressed',
        context.scopeMode === 'full-extracted' ? 'true' : 'false'
      );
      matrixScopeVisibleButton.setAttribute(
        'aria-pressed',
        context.scopeMode === 'visible-only' ? 'true' : 'false'
      );

      matrixWrap.innerHTML = buildMatrixMarkup({
        state,
        context,
        scopedNodeIndices,
        rowWindowStart,
        colWindowStart,
        rowWindowSize: activeRowWindowSize,
        colWindowSize: activeColWindowSize,
        editable: isMatrixEditable,
      });
      applyPendingCellFocus();
      updateRowSliderHeight();
    },
  };

  /**
   * Purpose: Re-render panel markup after local slider state changes.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Updates matrix panel DOM.
   */
  function renderFromCache() {
    if (!lastRenderedState || !lastRenderedContext) {
      return;
    }
    const state = lastRenderedState;
    const context = lastRenderedContext;
    const scopedNodeIndices = resolveScopedNodeIndices(context);
    const rowWindowLimit = Math.max(0, scopedNodeIndices.length - activeRowWindowSize);
    const colWindowLimit = Math.max(0, scopedNodeIndices.length - activeColWindowSize);
    rowWindowStart = clampWindowStart(rowWindowStart, rowWindowLimit);
    colWindowStart = clampWindowStart(colWindowStart, colWindowLimit);
    matrixRowSliderWrap.hidden = !showRowSlider;
    matrixColSliderWrap.hidden = !showColSlider;

    matrixRowSlider.max = String(rowWindowLimit);
    matrixRowSlider.value = String(rowWindowStart);
    matrixRowSlider.disabled = !showRowSlider || rowWindowLimit <= 0;
    matrixRowWindowLabel.textContent = formatWindowRange(
      rowWindowStart,
      activeRowWindowSize,
      scopedNodeIndices.length
    );

    matrixColSlider.max = String(colWindowLimit);
    matrixColSlider.value = String(colWindowStart);
    matrixColSlider.disabled = !showColSlider || colWindowLimit <= 0;
    matrixColWindowLabel.textContent = formatWindowRange(
      colWindowStart,
      activeColWindowSize,
      scopedNodeIndices.length
    );

    matrixWrap.innerHTML = buildMatrixMarkup({
      state,
      context,
      scopedNodeIndices,
      rowWindowStart,
      colWindowStart,
      rowWindowSize: activeRowWindowSize,
      colWindowSize: activeColWindowSize,
      editable: state.sourceMode === 'manual',
    });
    applyPendingCellFocus();
    updateRowSliderHeight();
  }

  /**
   * Purpose: Determine whether matrix inputs are editable for the current source mode.
   * Inputs: No direct parameters.
   * Returns: `true` when source mode is manual and matrix cells are editable.
   * Side effects: None (pure computation).
   */
  function isMatrixEditable(): boolean {
    return lastRenderedState?.sourceMode === 'manual';
  }

  /**
   * Purpose: Detect active reducer edit-session ownership for the matrix panel.
   * Inputs: No direct parameters.
   * Returns: `true` when matrix owns the current editing session.
   * Side effects: None (pure computation).
   */
  function isMatrixEditingSessionActive(): boolean {
    const session = lastRenderedState?.editSession;
    return session?.mode === 'editing' && session.ownerPanel === 'matrix';
  }

  /**
   * Purpose: Parse an edge edit target from a matrix input element.
   * Inputs: Matrix input element containing source/destination data attributes.
   * Returns: Parsed edge edit target or `null` when malformed.
   * Side effects: None (pure computation).
   */
  function readEdgeTargetFromInput(input: HTMLInputElement): EditTarget | null {
    const fromIndex = Number.parseInt(input.dataset.fromIndex ?? '', 10);
    const toIndex = Number.parseInt(input.dataset.toIndex ?? '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return null;
    }
    return {
      kind: 'edge',
      fromIndex,
      toIndex,
    };
  }

  /**
   * Purpose: Ensure matrix edit-session focus is synchronized to the active matrix cell.
   * Inputs: Target edge and source event hint.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer actions to start/focus matrix edit session.
   */
  function dispatchMatrixEditFocus(target: EditTarget, source: 'focus' | 'click' | 'tab') {
    const state = lastRenderedState;
    if (!state || state.sourceMode !== 'manual') {
      return;
    }
    const focusTarget =
      target.kind === 'edge'
        ? {
            fromIndex: target.fromIndex,
            toIndex: target.toIndex,
            armOverwrite: true,
          }
        : null;
    const session = state.editSession;
    if (session.mode !== 'editing') {
      if (focusTarget) {
        pendingFocusCell = focusTarget;
      }
      options.dispatch({
        type: 'EDIT_BEGIN',
        panel: 'matrix',
        target,
      });
      return;
    }
    if (
      session.ownerPanel === 'matrix' &&
      session.activeTarget?.kind === 'edge' &&
      target.kind === 'edge' &&
      session.activeTarget.fromIndex === target.fromIndex &&
      session.activeTarget.toIndex === target.toIndex &&
      source !== 'click'
    ) {
      return;
    }
    if (focusTarget) {
      pendingFocusCell = focusTarget;
    }
    options.dispatch({
      type: 'EDIT_FOCUS_TARGET',
      panel: 'matrix',
      target,
    });
  }

  /**
   * Purpose: Commit pending matrix draft edits and normalize transition/state vectors.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer actions that commit staged edits and normalize values.
   */
  function commitTransitionDraftsAndNormalize(reason: 'enter' | 'normalize_button') {
    const state = lastRenderedState;
    if (!state || state.sourceMode !== 'manual') {
      return;
    }
    if (state.editSession.mode === 'editing') {
      options.dispatch({
        type: 'EDIT_COMMIT',
        reason,
      });
      return;
    }
    options.dispatch({ type: 'NORMALIZE_MATRIX' });
  }

  /**
   * Purpose: Move matrix input focus in column-major order for custom tab behavior.
   * Inputs: Current matrix cell indices and traversal direction flag.
   * Returns: No value (`void`).
   * Side effects: Mutates window offsets and focuses a new input element.
   */
  function focusNextMatrixInputByColumn(config: {
    fromIndex: number;
    toIndex: number;
    reverse: boolean;
  }) {
    if (!lastRenderedContext) {
      focusFirstMatrixInput();
      return;
    }
    const scopedNodeIndices = resolveScopedNodeIndices(lastRenderedContext);
    const rowPosition = scopedNodeIndices.indexOf(config.toIndex);
    const colPosition = scopedNodeIndices.indexOf(config.fromIndex);
    if (rowPosition < 0 || colPosition < 0 || scopedNodeIndices.length === 0) {
      focusFirstMatrixInput();
      return;
    }

    let nextRowPosition = rowPosition;
    let nextColPosition = colPosition;
    if (config.reverse) {
      nextRowPosition -= 1;
      if (nextRowPosition < 0) {
        nextRowPosition = scopedNodeIndices.length - 1;
        nextColPosition =
          (nextColPosition - 1 + scopedNodeIndices.length) % scopedNodeIndices.length;
      }
    } else {
      nextRowPosition += 1;
      if (nextRowPosition >= scopedNodeIndices.length) {
        nextRowPosition = 0;
        nextColPosition = (nextColPosition + 1) % scopedNodeIndices.length;
      }
    }

    const nextFromIndex = scopedNodeIndices[nextColPosition];
    const nextToIndex = scopedNodeIndices[nextRowPosition];
    rowWindowStart = alignWindowStartToIncludeIndex(
      rowWindowStart,
      nextRowPosition,
      scopedNodeIndices.length,
      activeRowWindowSize
    );
    colWindowStart = alignWindowStartToIncludeIndex(
      colWindowStart,
      nextColPosition,
      scopedNodeIndices.length,
      activeColWindowSize
    );
    pendingFocusCell = {
      fromIndex: nextFromIndex,
      toIndex: nextToIndex,
      armOverwrite: true,
    };
    dispatchMatrixEditFocus(
      {
        kind: 'edge',
        fromIndex: nextFromIndex,
        toIndex: nextToIndex,
      },
      'tab'
    );
  }

  /**
   * Purpose: Focus the first matrix input when tab traversal cannot resolve a target cell.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Moves focus to the first visible matrix input.
   */
  function focusFirstMatrixInput() {
    const input = matrixWrap.querySelector<HTMLInputElement>('input.markov-number-input--matrix');
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    focusedMatrixInput = input;
    armInputForDestructiveEntry(input);
    updateFocusedInputCaretTone(input);
  }

  /**
   * Purpose: Keep tab focus constrained to matrix inputs when an edit is active.
   * Inputs: Optional current input before focus transition.
   * Returns: No value (`void`).
   * Side effects: Re-focuses a matrix input when tab focus escapes the panel.
   */
  function ensureMatrixTabFocusWithinPanel(currentInput?: HTMLInputElement) {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.classList.contains('markov-number-input--matrix') &&
        matrixWrap.contains(active)
      ) {
        return;
      }

      if (currentInput && currentInput.isConnected && matrixWrap.contains(currentInput)) {
        currentInput.focus({ preventScroll: true });
        focusedMatrixInput = currentInput;
        armInputForDestructiveEntry(currentInput);
        updateFocusedInputCaretTone(currentInput);
        return;
      }

      focusFirstMatrixInput();
    }, 0);
  }

  /**
   * Purpose: Restore focus to a matrix input after a DOM re-render.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Focuses an input element when a pending focus target exists.
   */
  function applyPendingCellFocus() {
    const pending = pendingFocusCell;
    if (!pending) {
      return;
    }
    const selector = `input.markov-number-input--matrix[data-from-index="${pending.fromIndex}"][data-to-index="${pending.toIndex}"]`;
    const input =
      matrixWrap.querySelector<HTMLInputElement>(selector) ??
      matrixWrap.querySelector<HTMLInputElement>('input.markov-number-input--matrix');
    pendingFocusCell = null;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    focusedMatrixInput = input;
    if (pending.armOverwrite) {
      armInputForDestructiveEntry(input);
    } else {
      overwriteArmedMatrixInput = null;
      moveCaretToEnd(input);
    }
    updateFocusedInputCaretTone(input);
  }

  /**
   * Purpose: Cancel active matrix editing and restore snapshot values.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer cancel action and redraws committed values.
   */
  function cancelMatrixEditing(reason: 'escape' | 'outside_click') {
    if (!isMatrixEditingSessionActive()) {
      return;
    }
    options.dispatch({
      type: 'EDIT_CANCEL',
      reason,
    });
  }

  /**
   * Purpose: Sync vertical slider height to the currently visible matrix table height.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Updates row-slider inline height styles.
   */
  function updateRowSliderHeight() {
    const table = matrixWrap.querySelector<HTMLTableElement>('table.markov-matrix-table');
    if (!table) {
      matrixRowSliderWrap.style.removeProperty('height');
      matrixRowSlider.style.removeProperty('height');
      matrixRowSlider.style.removeProperty('min-height');
      return;
    }
    const height = Math.max(0, Math.round(table.getBoundingClientRect().height));
    matrixRowSliderWrap.style.height = `${height}px`;
    matrixRowSlider.style.height = 'auto';
    matrixRowSlider.style.minHeight = '0px';
  }

  /**
   * Purpose: Color focused input caret red when pointer is over the same cell, else blue.
   * Inputs: Latest pointer event target.
   * Returns: No value (`void`).
   * Side effects: Updates focused input CSS classes.
   */
  function updateFocusedInputCaretTone(pointerTarget: EventTarget | null) {
    if (!focusedMatrixInput) {
      return;
    }
    const focusedCell = focusedMatrixInput.closest('td');
    const pointerCell =
      pointerTarget instanceof Element ? pointerTarget.closest('td') : null;
    const isPointerInsideFocusedCell =
      Boolean(focusedCell) && Boolean(pointerCell) && focusedCell === pointerCell;
    focusedMatrixInput.classList.toggle('markov-input-caret-red', isPointerInsideFocusedCell);
    focusedMatrixInput.classList.toggle('markov-input-caret-blue', !isPointerInsideFocusedCell);
  }

  /**
   * Purpose: Switch a clicked input into overwrite-on-next-key mode.
   * Inputs: Input element that received pointer click.
   * Returns: No value (`void`).
   * Side effects: Arms destructive entry behavior for this input.
   */
  function armInputForDestructiveEntry(input: HTMLInputElement) {
    overwriteArmedMatrixInput = input;
    try {
      input.select();
    } catch {
      // Number inputs may ignore text selection in some browsers.
    }
  }

  /**
   * Purpose: Switch an active matrix input to insert mode.
   * Inputs: Focused matrix input.
   * Returns: No value (`void`).
   * Side effects: Clears overwrite arming and collapses text selection to a caret.
   */
  function disarmInputForInsertMode(input: HTMLInputElement) {
    overwriteArmedMatrixInput = null;
    try {
      const caret = input.selectionEnd ?? input.selectionStart ?? input.value.length;
      input.setSelectionRange(caret, caret);
    } catch {
      // Ignore browsers that disallow selection control for this input type.
    }
  }

  /**
   * Purpose: Measure whether full matrix columns overflow the panel viewport.
   * Inputs: Current state/context and scoped node indices.
   * Returns: `true` when a column slider is needed to access hidden columns.
   * Side effects: Temporarily renders full matrix content in the wrap for size measurement.
   */
  function measureMatrixColumnOverflow(options: {
    state: AppState;
    context: PanelRenderContext;
    scopedNodeIndices: number[];
    editable: boolean;
  }): boolean {
    if (options.scopedNodeIndices.length <= MATRIX_COL_WINDOW_SIZE) {
      return false;
    }

    const previousRowSliderHidden = matrixRowSliderWrap.hidden;
    const previousColSliderHidden = matrixColSliderWrap.hidden;
    matrixRowSliderWrap.hidden = true;
    matrixColSliderWrap.hidden = true;

    matrixWrap.innerHTML = buildMatrixMarkup({
      state: options.state,
      context: options.context,
      scopedNodeIndices: options.scopedNodeIndices,
      rowWindowStart: 0,
      colWindowStart: 0,
      rowWindowSize: options.scopedNodeIndices.length,
      colWindowSize: options.scopedNodeIndices.length,
      editable: options.editable,
    });
    const hasRenderableViewport = matrixWrap.clientWidth > 1 && matrixWrap.clientHeight > 1;
    const hasColOverflow =
      hasRenderableViewport && matrixWrap.scrollWidth > matrixWrap.clientWidth + 2;

    matrixRowSliderWrap.hidden = previousRowSliderHidden;
    matrixColSliderWrap.hidden = previousColSliderHidden;
    return hasColOverflow;
  }

  /**
   * Purpose: Ensure selected targets are visible inside the current matrix row/column windows.
   * Inputs: Selected target and scoped node list used for panel display.
   * Returns: No value (`void`).
   * Side effects: Mutates local row/column window offsets.
   */
  function autoScrollWindowsToSelectedTarget(
    selectedTarget: GraphInteractionTarget | null,
    scopedNodeIndices: readonly number[]
  ) {
    if (!selectedTarget || scopedNodeIndices.length <= 0) {
      return;
    }

    const indexByNode = new Map<number, number>();
    scopedNodeIndices.forEach((nodeIndex, position) => {
      indexByNode.set(nodeIndex, position);
    });

    if (selectedTarget.kind === 'node' || selectedTarget.kind === 'incoming-node') {
      const nodePosition = indexByNode.get(selectedTarget.nodeIndex);
      if (typeof nodePosition === 'number') {
        colWindowStart = alignWindowStartToIncludeIndex(
          colWindowStart,
          nodePosition,
          scopedNodeIndices.length,
          MATRIX_COL_WINDOW_SIZE
        );
        rowWindowStart = alignWindowStartToIncludeIndex(
          rowWindowStart,
          nodePosition,
          scopedNodeIndices.length,
          MATRIX_ROW_WINDOW_SIZE
        );
      }
      return;
    }

    const fromPosition = indexByNode.get(selectedTarget.fromIndex);
    if (typeof fromPosition === 'number') {
      colWindowStart = alignWindowStartToIncludeIndex(
        colWindowStart,
        fromPosition,
        scopedNodeIndices.length,
        MATRIX_COL_WINDOW_SIZE
      );
    }

    const toPosition = indexByNode.get(selectedTarget.toIndex);
    if (typeof toPosition === 'number') {
      rowWindowStart = alignWindowStartToIncludeIndex(
        rowWindowStart,
        toPosition,
        scopedNodeIndices.length,
        MATRIX_ROW_WINDOW_SIZE
      );
    }
  }
}

/**
 * Purpose: Build matrix table markup for the current scope window and highlight context.
 * Inputs: Render state, scoped indices, and local window offsets.
 * Returns: HTML string for matrix table content.
 * Side effects: None (pure computation).
 */
function buildMatrixMarkup(config: {
  state: AppState;
  context: PanelRenderContext;
  scopedNodeIndices: number[];
  rowWindowStart: number;
  colWindowStart: number;
  rowWindowSize: number;
  colWindowSize: number;
  editable: boolean;
}): string {
  if (config.scopedNodeIndices.length <= 0) {
    return `
      <p class="markov-window-empty" role="status">
        No nodes are currently visible in the graph viewport for this scope.
      </p>
    `;
  }

  const displayedRowNodeIndices = config.scopedNodeIndices.slice(
    config.rowWindowStart,
    config.rowWindowStart + config.rowWindowSize
  );
  const displayedColNodeIndices = config.scopedNodeIndices.slice(
    config.colWindowStart,
    config.colWindowStart + config.colWindowSize
  );
  const visibleNodeSet = new Set(config.context.viewportVisibleNodeIndices);

  const redHeaderColumnNodeIndex =
    config.context.activeTarget?.kind === 'node'
      ? config.context.activeTarget.nodeIndex
      : config.context.activeTarget?.kind === 'edge'
        ? config.context.activeTarget.fromIndex
        : null;
  const redBodyColumnNodeIndex =
    config.context.activeTarget?.kind === 'node' ? config.context.activeTarget.nodeIndex : null;
  const hasRowWideHighlight = config.context.activeTarget?.kind === 'incoming-node';
  const hasColumnWideHighlight = config.context.activeTarget?.kind === 'node';
  const redRowNodeIndex =
    config.context.activeTarget?.kind === 'edge'
      ? config.context.activeTarget.toIndex
      : config.context.activeTarget?.kind === 'incoming-node'
        ? config.context.activeTarget.nodeIndex
        : null;
  const redEdgeKey =
    config.context.activeTarget?.kind === 'edge'
      ? edgeKey(config.context.activeTarget.fromIndex, config.context.activeTarget.toIndex)
      : null;

  const columnHeaders = displayedColNodeIndices
    .map((fromIndex) => {
      const value = config.state.currentVector[fromIndex] ?? 0;
      const color = computeMatrixColumnHighlightColor({
        nodeIndex: fromIndex,
        nodeValue: value,
        visibleNodeSet,
        redColumnNodeIndex: redHeaderColumnNodeIndex,
      });
      return `
        <th
          scope="col"
          data-graph-target-kind="node"
          data-node-index="${fromIndex}"
          ${toStyleAttribute(color)}
        >
          ${formatNodeLabelMarkup(fromIndex)}
        </th>
      `;
    })
    .join('');

  const bodyRows = displayedRowNodeIndices
    .map((toIndex) => {
      const rowValue = config.state.currentVector[toIndex] ?? 0;
      const rowHighlightColor = computeMatrixRowHighlightColor({
        nodeIndex: toIndex,
        nodeValue: rowValue,
        visibleNodeSet,
        redRowNodeIndex,
      });

      const rowCells = displayedColNodeIndices
        .map((fromIndex) => {
          const committedCellValue = config.state.transitionMatrix[fromIndex]?.[toIndex] ?? 0;
          const displayedValue = selectDisplayedTransitionCell(config.state, fromIndex, toIndex);
          const isGraphInlineEdgeEditing =
            config.state.editSession.mode === 'editing' &&
            config.state.editSession.ownerPanel === 'graph' &&
            config.state.editSession.activeTarget?.kind === 'edge' &&
            config.state.editSession.activeTarget.fromIndex === fromIndex &&
            config.state.editSession.activeTarget.toIndex === toIndex;
          const hasEdge = committedCellValue > PROBABILITY_EPSILON;
          const isRowHighlighted = hasRowWideHighlight && redRowNodeIndex === toIndex;
          const isColumnHighlighted =
            hasColumnWideHighlight && redBodyColumnNodeIndex === fromIndex;
          const cellColor = computeMatrixCellHighlightColor({
            fromIndex,
            toIndex,
            redEdgeKey,
            edgeWeight: committedCellValue,
            isRowHighlighted,
            isColumnHighlighted,
          });
          const cellTargetAttributes = hasEdge
            ? `data-graph-target-kind="edge" data-from-index="${fromIndex}" data-to-index="${toIndex}" data-edge-weight="${committedCellValue.toFixed(6)}"`
            : '';

          if (!config.editable) {
            return `
              <td ${cellTargetAttributes} ${toStyleAttribute(cellColor)}>
                <span class="markov-readonly-value">${committedCellValue.toFixed(4)}</span>
              </td>
            `;
          }

          return `
            <td ${cellTargetAttributes} ${toStyleAttribute(cellColor)}>
              <input
                class="markov-number-input markov-number-input--matrix${isGraphInlineEdgeEditing ? ' markov-input-caret-red' : ''}"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                data-from-index="${fromIndex}"
                data-to-index="${toIndex}"
                data-graph-target-kind="edge"
                data-edge-weight="${committedCellValue.toFixed(6)}"
                value="${formatEditableInputValue(displayedValue)}"
                aria-label="Transposed entry for transition probability from state ${fromIndex + 1} to state ${toIndex + 1}"
              />
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <th
            scope="row"
            data-graph-target-kind="incoming-node"
            data-node-index="${toIndex}"
            ${toStyleAttribute(rowHighlightColor)}
          >
            ${formatNodeLabelMarkup(toIndex)}
          </th>
          ${rowCells}
        </tr>
      `;
    })
    .join('');

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
      </tbody>
    </table>
  `;
}

/**
 * Purpose: Create deterministic edge-key strings.
 * Inputs: Source and destination node indices.
 * Returns: Edge key string.
 * Side effects: None (pure computation).
 */
function edgeKey(fromIndex: number, toIndex: number): string {
  return `${fromIndex}->${toIndex}`;
}

/**
 * Purpose: Derive highlight color for matrix column headers.
 * Inputs: Node identity/value and active visibility/interaction context.
 * Returns: CSS color string or `null`.
 * Side effects: None (pure computation).
 */
function computeMatrixColumnHighlightColor(options: {
  nodeIndex: number;
  nodeValue: number;
  visibleNodeSet: ReadonlySet<number>;
  redColumnNodeIndex: number | null;
}): string | null {
  if (options.redColumnNodeIndex === options.nodeIndex) {
    return colorForPanelRed(options.nodeValue, 0.52);
  }
  if (options.visibleNodeSet.has(options.nodeIndex)) {
    return colorForPanelBlue(options.nodeValue, 0.38);
  }
  return null;
}

/**
 * Purpose: Derive highlight color for matrix row headers.
 * Inputs: Node identity/value and active visibility/interaction context.
 * Returns: CSS color string or `null`.
 * Side effects: None (pure computation).
 */
function computeMatrixRowHighlightColor(options: {
  nodeIndex: number;
  nodeValue: number;
  visibleNodeSet: ReadonlySet<number>;
  redRowNodeIndex: number | null;
}): string | null {
  if (options.redRowNodeIndex === options.nodeIndex) {
    return colorForPanelRed(options.nodeValue, 0.52);
  }
  if (options.visibleNodeSet.has(options.nodeIndex)) {
    return colorForPanelBlue(options.nodeValue, 0.34);
  }
  return null;
}

/**
 * Purpose: Derive per-cell highlight color with red-over-blue precedence.
 * Inputs: Cell node indices and context for active and visible highlights.
 * Returns: CSS color string or `null`.
 * Side effects: None (pure computation).
 */
function computeMatrixCellHighlightColor(options: {
  fromIndex: number;
  toIndex: number;
  redEdgeKey: string | null;
  edgeWeight: number;
  isRowHighlighted: boolean;
  isColumnHighlighted: boolean;
}): string | null {
  const cellKey = edgeKey(options.fromIndex, options.toIndex);
  if (options.redEdgeKey && options.redEdgeKey === cellKey) {
    return colorForMatrixEntryByEdgeWeight(options.edgeWeight);
  }
  if (options.isRowHighlighted) {
    return colorForMatrixEntryByEdgeWeight(options.edgeWeight);
  }
  if (options.isColumnHighlighted) {
    return colorForMatrixEntryByEdgeWeight(options.edgeWeight);
  }
  return null;
}

/**
 * Purpose: Compute matrix entry red highlight shades from edge weight.
 * Inputs: Edge transition probability in [0, 1].
 * Returns: CSS color string for red-highlighted matrix entries.
 * Side effects: None (pure computation).
 */
function colorForMatrixEntryByEdgeWeight(edgeWeight: number): string {
  const normalizedWeight = clamp01(edgeWeight);
  const alpha = 0.12 + normalizedWeight * 0.5;
  return colorForPanelRed(normalizedWeight, alpha);
}
