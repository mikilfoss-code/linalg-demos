import type { Action } from './actions';
import type { EditTarget } from './edit-session';
import type { PanelRenderContext } from './panel-context';
import { selectDisplayedInitialValue, selectDisplayedNodeValue } from './selectors';
import type { AppState } from './types';
import { formatNodeLabelMarkup } from './node-label';
import {
  formatEditableInputValue,
  moveCaretToEnd,
  readNonNegativeDraftInputValue,
  shouldUseDestructiveOverwrite,
} from './edit-value-input';
import type { GraphInteractionTarget } from './graph-interaction-presenter';
import { createTemplateElement, requireElement } from './dom-helpers';
import {
  alignWindowStartToIncludeIndex as alignWindowStartToIncludeIndexShared,
  clampWindowStart,
  colorForPanelBlue,
  colorForPanelRed,
  formatWindowRange,
  graphTargetKey,
  PANEL_ROW_WINDOW_SIZE,
  resolveScopedNodeIndices,
  toStyleAttribute,
} from './panel-shared';

const STATE_WINDOW_SIZE = PANEL_ROW_WINDOW_SIZE;

/**
 * Purpose: StatePanelController object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type StatePanelController = {
  element: HTMLElement;
  render: (state: AppState, context: PanelRenderContext) => void;
  setAutoStepRunning: (running: boolean) => void;
};

/**
 * Create the right-side panel containing state vectors and step controls.
 */
export function createStatePanelController(options: {
  dispatch: (action: Action) => void;
  onToggleAutoStep: () => void;
  getSharedRowWindowStart: () => number;
  onSetSharedRowWindowStart: (start: number) => void;
  onRequestPanelSyncRender: () => void;
}): StatePanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-state">
      <h2 class="base-panel-title">State Vectors</h2>
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

      <div class="markov-state-view">
        <div class="markov-state-window-controls" id="state-window-controls">
          <label class="markov-control-label" for="state-row-slider">Rows</label>
          <input
            class="markov-window-slider markov-window-slider--vertical"
            id="state-row-slider"
            type="range"
            min="0"
            max="0"
            step="1"
            value="0"
          />
          <span class="markov-window-range-label" id="state-row-window-label">1-1 / 1</span>
        </div>

        <div class="markov-state-table-wrap" id="state-table-wrap">
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
      </div>

      <p class="markov-error-list" id="validation-errors" role="status"></p>
    </section>
  `);

  const stateVectorBody = requireElement<HTMLTableSectionElement>(element, '#state-vector-body');
  const stateTableWrap = requireElement<HTMLDivElement>(element, '#state-table-wrap');
  const stateWindowControls = requireElement<HTMLDivElement>(element, '#state-window-controls');
  const stateRowSlider = requireElement<HTMLInputElement>(element, '#state-row-slider');
  const stateRowWindowLabel = requireElement<HTMLElement>(element, '#state-row-window-label');
  const stepCountEl = requireElement<HTMLElement>(element, '#step-count');
  const validationErrorsEl = requireElement<HTMLElement>(element, '#validation-errors');
  const stepButton = requireElement<HTMLButtonElement>(element, '#state-step-one-button');
  const toggleAutoStepButton = requireElement<HTMLButtonElement>(
    element,
    '#state-toggle-auto-step-button'
  );
  const initialActionButtons = Array.from(
    element.querySelectorAll<HTMLButtonElement>('.markov-initial-button')
  );
  let isAutoStepRunning = false;
  let highlightOneStepButton = false;
  let oneStepHighlightTimeoutId: number | null = null;
  let rowWindowStart = readSharedRowWindowStart();
  let activeRowWindowSize = STATE_WINDOW_SIZE;
  let showRowSlider = false;
  let focusedStateInput: HTMLInputElement | null = null;
  let overwriteArmedStateInput: HTMLInputElement | null = null;
  let pendingFocusInitialIndex: { index: number; armOverwrite: boolean } | null = null;
  let lastRenderedState: AppState | null = null;
  let lastRenderedContext: PanelRenderContext | null = null;
  let lastAutoScrolledSelectedTargetKey: string | null = null;
  updateControlButtonStyles();

  stateRowSlider.addEventListener('input', () => {
    setSharedRowWindowStart(Number.parseInt(stateRowSlider.value, 10) || 0);
    options.onRequestPanelSyncRender();
  });

  stateVectorBody.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('markov-number-input--state')) return;
    if (target.dataset.kind !== 'initial') return;

    const index = Number.parseInt(target.dataset.index ?? '', 10);
    const draft = readNonNegativeDraftInputValue(target);
    if (!Number.isInteger(index) || !draft.shouldDispatch || draft.value === null) {
      return;
    }
    pendingFocusInitialIndex = {
      index,
      armOverwrite: false,
    };
    options.dispatch({
      type: 'EDIT_CHANGE_VALUE',
      target: {
        kind: 'initial',
        index,
      },
      value: draft.value,
    });
  });

  stateVectorBody.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.classList.contains('markov-number-input--state')) {
      return;
    }
    if (target.dataset.kind === 'initial') {
      const initialTarget = readInitialTargetFromInput(target);
      if (initialTarget) {
        dispatchStateEditFocus(initialTarget, 'focus');
      }
    }
    armInputForDestructiveEntry(target);
    focusedStateInput = target;
    updateFocusedInputCaretTone(event.target);
  });

  stateVectorBody.addEventListener('focusout', (event) => {
    if (!(event instanceof FocusEvent)) {
      return;
    }
    const related = event.relatedTarget;
    if (
      related instanceof HTMLInputElement &&
      related.classList.contains('markov-number-input--state')
    ) {
      return;
    }
    if (focusedStateInput) {
      focusedStateInput.classList.remove('markov-input-caret-red', 'markov-input-caret-blue');
    }
    overwriteArmedStateInput = null;
    focusedStateInput = null;
  });

  stateVectorBody.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('markov-number-input--state')) return;
    if (target.dataset.kind !== 'initial') return;
    const isAlreadyActiveInput = document.activeElement === target;
    const initialTarget = readInitialTargetFromInput(target);
    if (initialTarget && !isAlreadyActiveInput) {
      dispatchStateEditFocus(initialTarget, 'click');
    }
    if (isAlreadyActiveInput) {
      if (overwriteArmedStateInput === target) {
        disarmInputForInsertMode(target);
      } else {
        armInputForDestructiveEntry(target);
      }
    } else {
      armInputForDestructiveEntry(target);
    }
    focusedStateInput = target;
    updateFocusedInputCaretTone(target);
  });

  stateVectorBody.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('markov-number-input--state')) return;
    if (target.dataset.kind !== 'initial') return;

    const index = Number.parseInt(target.dataset.index ?? '', 10);
    if (!Number.isInteger(index)) {
      return;
    }

    if (overwriteArmedStateInput === target && shouldUseDestructiveOverwrite(event)) {
      target.value = '';
      overwriteArmedStateInput = null;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInitialEditing('escape');
      overwriteArmedStateInput = null;
      target.blur();
      return;
    }

    if (event.key === 'Tab') {
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
            kind: 'initial',
            index,
          },
          value: draft.value,
        });
      }
      options.dispatch({
        type: 'EDIT_TAB_NAVIGATE',
        panel: 'state',
        reverse: event.shiftKey,
      });
      overwriteArmedStateInput = null;
      focusNextInitialInput({
        index,
        reverse: event.shiftKey,
      });
      ensureStateTabFocusWithinPanel(target);
      return;
    }

    if (event.key !== 'Enter') return;
    const draft = readNonNegativeDraftInputValue(target, {
      deferTrailingDecimal: false,
      deferZeroOnlyFraction: false,
    });
    if (draft.value === null) {
      return;
    }
    event.preventDefault();
    options.dispatch({
      type: 'EDIT_CHANGE_VALUE',
      target: {
        kind: 'initial',
        index,
      },
      value: draft.value,
    });
    overwriteArmedStateInput = null;
    target.blur();
    commitInitialDraftsAndNormalize('enter');
  });

  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) {
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) {
      return;
    }
    if (!active.classList.contains('markov-number-input--state')) {
      return;
    }
    if (active.dataset.kind !== 'initial') {
      return;
    }
    if (!stateTableWrap.contains(active)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const index = Number.parseInt(active.dataset.index ?? '', 10);
    if (!Number.isInteger(index)) {
      focusFirstInitialInput();
      ensureStateTabFocusWithinPanel(active);
      return;
    }
    options.dispatch({
      type: 'EDIT_TAB_NAVIGATE',
      panel: 'state',
      reverse: event.shiftKey,
    });
    overwriteArmedStateInput = null;
    focusNextInitialInput({
      index,
      reverse: event.shiftKey,
    });
    ensureStateTabFocusWithinPanel(active);
  });

  const handleWindowPointerDown = (event: PointerEvent) => {
    if (!isStateEditingSessionActive() && !focusedStateInput) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-action="normalize-matrix"]')) {
      commitInitialDraftsAndNormalize('normalize_button');
      return;
    }
    if (focusedStateInput && target === focusedStateInput) {
      return;
    }
    if (element.contains(target)) {
      return;
    }
    cancelInitialEditing('outside_click');
    if (focusedStateInput && focusedStateInput.isConnected) {
      focusedStateInput.blur();
    }
  };
  window.addEventListener('pointerdown', handleWindowPointerDown, true);

  element.addEventListener('pointermove', (event) => {
    updateFocusedInputCaretTone(event.target);
  });

  element.addEventListener('pointerleave', () => {
    updateFocusedInputCaretTone(null);
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
        if (!isStateEditable()) return;
        options.dispatch({ type: 'SET_INITIAL_UNIFORM' });
        break;
      case 'set-initial-random':
        if (!isStateEditable()) return;
        options.dispatch({ type: 'SET_INITIAL_RANDOM' });
        break;
      case 'set-initial-current':
        if (!isStateEditable()) return;
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
    render(state, context) {
      lastRenderedState = state;
      lastRenderedContext = context;
      rowWindowStart = readSharedRowWindowStart();

      stepCountEl.textContent = String(state.stepCount);
      stepButton.disabled = !state.validation.canStep && !state.hasPendingMatrixEdits;
      const editable = state.sourceMode === 'manual';
      initialActionButtons.forEach((button) => {
        button.disabled = !editable;
      });

      const scopedNodeIndices = resolveScopedNodeIndices(context);
      const selectedTargetKey = graphTargetKey(context.selectedTarget);
      if (selectedTargetKey && selectedTargetKey !== lastAutoScrolledSelectedTargetKey) {
        autoScrollWindowToSelectedTarget(context.selectedTarget, scopedNodeIndices);
      }
      lastAutoScrolledSelectedTargetKey = selectedTargetKey;

      showRowSlider = scopedNodeIndices.length > STATE_WINDOW_SIZE;
      activeRowWindowSize = showRowSlider
        ? Math.min(STATE_WINDOW_SIZE, scopedNodeIndices.length)
        : scopedNodeIndices.length;
      if (!showRowSlider) {
        setSharedRowWindowStart(0);
      }

      const rowWindowLimit = Math.max(0, scopedNodeIndices.length - activeRowWindowSize);
      setSharedRowWindowStart(clampWindowStart(rowWindowStart, rowWindowLimit));
      stateWindowControls.hidden = !showRowSlider;

      stateRowSlider.max = String(rowWindowLimit);
      stateRowSlider.value = String(rowWindowStart);
      stateRowSlider.disabled = !showRowSlider || rowWindowLimit <= 0;
      stateRowWindowLabel.textContent = formatWindowRange(
        rowWindowStart,
        activeRowWindowSize,
        scopedNodeIndices.length
      );

      stateVectorBody.innerHTML = buildStateRowsMarkup({
        state,
        context,
        scopedNodeIndices,
        rowWindowStart,
        windowSize: activeRowWindowSize,
      });
      applyPendingInitialInputFocus();
      updateRowSliderHeight();

      if (state.validation.errors.length > 0) {
        validationErrorsEl.textContent = state.validation.errors[0];
      } else {
        validationErrorsEl.textContent = '';
      }
    },
  };

  function isStateEditable(): boolean {
    return lastRenderedState?.sourceMode === 'manual';
  }

  /**
   * Purpose: Ensure selected graph targets are visible in the state window.
   * Inputs: Selected target and scoped node list.
   * Returns: No value (`void`).
   * Side effects: Mutates local row-window offset.
   */
  function autoScrollWindowToSelectedTarget(
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
        rowWindowStart = alignWindowStartToIncludeIndex(
          rowWindowStart,
          nodePosition,
          scopedNodeIndices.length
        );
      }
      return;
    }

    const toPosition = indexByNode.get(selectedTarget.toIndex);
    if (typeof toPosition === 'number') {
      rowWindowStart = alignWindowStartToIncludeIndex(
        rowWindowStart,
        toPosition,
        scopedNodeIndices.length
      );
    }
  }

  /**
   * Purpose: Detect active reducer edit-session ownership for the state panel.
   * Inputs: No direct parameters.
   * Returns: `true` when state panel owns the current editing session.
   * Side effects: None (pure computation).
   */
  function isStateEditingSessionActive(): boolean {
    const session = lastRenderedState?.editSession;
    return session?.mode === 'editing' && session.ownerPanel === 'state';
  }

  /**
   * Purpose: Parse an initial-state edit target from a state input element.
   * Inputs: State input element containing node index data.
   * Returns: Parsed initial edit target or `null` when malformed.
   * Side effects: None (pure computation).
   */
  function readInitialTargetFromInput(input: HTMLInputElement): EditTarget | null {
    const index = Number.parseInt(input.dataset.index ?? '', 10);
    if (!Number.isInteger(index)) {
      return null;
    }
    return {
      kind: 'initial',
      index,
    };
  }

  /**
   * Purpose: Ensure state edit-session focus is synchronized to the active initial-state cell.
   * Inputs: Target initial-state index and source event hint.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer actions to start/focus state edit session.
   */
  function dispatchStateEditFocus(target: EditTarget, source: 'focus' | 'click' | 'tab') {
    const state = lastRenderedState;
    if (!state || target.kind !== 'initial') {
      return;
    }
    const focusTarget = {
      index: target.index,
      armOverwrite: true,
    };
    const session = state.editSession;
    if (session.mode !== 'editing') {
      pendingFocusInitialIndex = focusTarget;
      options.dispatch({
        type: 'EDIT_BEGIN',
        panel: 'state',
        target,
      });
      return;
    }
    if (
      session.ownerPanel === 'state' &&
      session.activeTarget?.kind === 'initial' &&
      session.activeTarget.index === target.index &&
      source !== 'click'
    ) {
      return;
    }
    pendingFocusInitialIndex = focusTarget;
    options.dispatch({
      type: 'EDIT_FOCUS_TARGET',
      panel: 'state',
      target,
    });
  }

  /**
   * Purpose: Commit staged initial-vector edits and normalize/reset x_t to x_0.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer actions that commit staged edits and normalize values.
   */
  function commitInitialDraftsAndNormalize(reason: 'enter' | 'normalize_button') {
    const state = lastRenderedState;
    if (!state) {
      return;
    }
    if (state.editSession.mode === 'editing') {
      options.dispatch({
        type: 'EDIT_COMMIT',
        reason,
      });
      return;
    }
    options.dispatch({
      type: 'NORMALIZE_INITIAL_AND_RESET',
    });
  }

  /**
   * Purpose: Cancel active state editing and restore snapshot values.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Dispatches reducer cancel action.
   */
  function cancelInitialEditing(reason: 'escape' | 'outside_click') {
    if (!isStateEditingSessionActive()) {
      return;
    }
    options.dispatch({
      type: 'EDIT_CANCEL',
      reason,
    });
  }

  /**
   * Purpose: Focus the next initial-state input using cyclic row traversal.
   * Inputs: Current row index and traversal direction.
   * Returns: No value (`void`).
   * Side effects: Updates local row window offset and focuses a new input element.
   */
  function focusNextInitialInput(config: {
    index: number;
    reverse: boolean;
  }) {
    if (!lastRenderedContext) {
      focusFirstInitialInput();
      return;
    }
    const scopedNodeIndices = resolveScopedNodeIndices(lastRenderedContext);
    const currentPosition = scopedNodeIndices.indexOf(config.index);
    if (currentPosition < 0 || scopedNodeIndices.length === 0) {
      focusFirstInitialInput();
      return;
    }
    const nextPosition = config.reverse
      ? (currentPosition - 1 + scopedNodeIndices.length) % scopedNodeIndices.length
      : (currentPosition + 1) % scopedNodeIndices.length;
    setSharedRowWindowStart(
      alignWindowStartToIncludeIndex(rowWindowStart, nextPosition, scopedNodeIndices.length)
    );
    const nextIndex = scopedNodeIndices[nextPosition];
    pendingFocusInitialIndex = {
      index: nextIndex,
      armOverwrite: true,
    };
    dispatchStateEditFocus(
      {
        kind: 'initial',
        index: nextIndex,
      },
      'tab'
    );
  }

  /**
   * Purpose: Focus the first editable initial-state input in the current state window.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Moves focus to the first visible initial-state input.
   */
  function focusFirstInitialInput() {
    const input = stateVectorBody.querySelector<HTMLInputElement>(
      'input.markov-number-input--state[data-kind="initial"]'
    );
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    focusedStateInput = input;
    armInputForDestructiveEntry(input);
    updateFocusedInputCaretTone(input);
  }

  /**
   * Purpose: Keep tab focus constrained to state inputs when an edit is active.
   * Inputs: Optional current input before focus transition.
   * Returns: No value (`void`).
   * Side effects: Re-focuses a state input when tab focus escapes the panel.
   */
  function ensureStateTabFocusWithinPanel(currentInput?: HTMLInputElement) {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.classList.contains('markov-number-input--state') &&
        active.dataset.kind === 'initial' &&
        stateTableWrap.contains(active)
      ) {
        return;
      }

      if (currentInput && currentInput.isConnected && stateTableWrap.contains(currentInput)) {
        currentInput.focus({ preventScroll: true });
        focusedStateInput = currentInput;
        armInputForDestructiveEntry(currentInput);
        updateFocusedInputCaretTone(currentInput);
        return;
      }

      focusFirstInitialInput();
    }, 0);
  }

  /**
   * Purpose: Restore focus to an initial-state input after panel rerender.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Focuses a matching initial input when one is available.
   */
  function applyPendingInitialInputFocus() {
    const pending = pendingFocusInitialIndex;
    if (!pending) {
      return;
    }
    const selector = `input.markov-number-input--state[data-kind="initial"][data-index="${pending.index}"]`;
    const input =
      stateVectorBody.querySelector<HTMLInputElement>(selector) ??
      stateVectorBody.querySelector<HTMLInputElement>(
        'input.markov-number-input--state[data-kind="initial"]'
      );
    pendingFocusInitialIndex = null;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    focusedStateInput = input;
    if (pending.armOverwrite) {
      armInputForDestructiveEntry(input);
    } else {
      overwriteArmedStateInput = null;
      moveCaretToEnd(input);
    }
    updateFocusedInputCaretTone(input);
  }

  /**
   * Purpose: Switch clicked initial-state inputs into overwrite-on-next-key mode.
   * Inputs: Input element receiving click focus.
   * Returns: No value (`void`).
   * Side effects: Arms destructive entry for the selected input.
   */
  function armInputForDestructiveEntry(input: HTMLInputElement) {
    overwriteArmedStateInput = input;
    try {
      input.select();
    } catch {
      // Number inputs may ignore text selection in some browsers.
    }
  }

  /**
   * Purpose: Switch an active state input to insert mode.
   * Inputs: Focused state input.
   * Returns: No value (`void`).
   * Side effects: Clears overwrite arming and collapses text selection to a caret.
   */
  function disarmInputForInsertMode(input: HTMLInputElement) {
    overwriteArmedStateInput = null;
    try {
      const caret = input.selectionEnd ?? input.selectionStart ?? input.value.length;
      input.setSelectionRange(caret, caret);
    } catch {
      // Ignore browsers that disallow selection control for this input type.
    }
  }

  /**
   * Purpose: Keep state-row window within current visibility bounds.
   * Inputs: Requested start row and scoped row count.
   * Returns: Clamped row-window start.
   * Side effects: None (pure computation).
   */
  function clampStateWindowStart(start: number, scopedSize: number): number {
    const maxStart = Math.max(0, scopedSize - activeRowWindowSize);
    return clampWindowStart(start, maxStart);
  }

  /**
   * Purpose: Move state-row window so a target row remains visible.
   * Inputs: Current start, target row index, and scoped row count.
   * Returns: Updated row-window start.
   * Side effects: None (pure computation).
   */
  function alignWindowStartToIncludeIndex(
    windowStart: number,
    targetIndex: number,
    scopedSize: number
  ): number {
    const start = clampStateWindowStart(windowStart, scopedSize);
    return alignWindowStartToIncludeIndexShared(
      start,
      targetIndex,
      scopedSize,
      activeRowWindowSize
    );
  }

  /**
   * Purpose: Color focused input caret red when pointer is over same cell, else blue.
   * Inputs: Latest pointer event target.
   * Returns: No value (`void`).
   * Side effects: Updates focused input CSS classes.
   */
  function updateFocusedInputCaretTone(pointerTarget: EventTarget | null) {
    if (!focusedStateInput) {
      return;
    }
    const focusedCell = focusedStateInput.closest('td');
    const pointerCell =
      pointerTarget instanceof Element ? pointerTarget.closest('td') : null;
    const isPointerInsideFocusedCell =
      Boolean(focusedCell) && Boolean(pointerCell) && focusedCell === pointerCell;
    focusedStateInput.classList.toggle('markov-input-caret-red', isPointerInsideFocusedCell);
    focusedStateInput.classList.toggle('markov-input-caret-blue', !isPointerInsideFocusedCell);
  }

  /**
   * Purpose: Read and normalize shared row-window start used across matrix/state panels.
   * Inputs: No direct parameters.
   * Returns: Non-negative integer row-window start offset.
   * Side effects: None (pure computation).
   */
  function readSharedRowWindowStart(): number {
    const value = options.getSharedRowWindowStart();
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.floor(value);
  }

  /**
   * Purpose: Persist a row-window start so matrix/state panels stay synchronized.
   * Inputs: Desired row-window start index.
   * Returns: No value (`void`).
   * Side effects: Updates local and shared row-window offsets.
   */
  function setSharedRowWindowStart(start: number) {
    const normalized = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
    rowWindowStart = normalized;
    options.onSetSharedRowWindowStart(normalized);
  }

  /**
   * Purpose: Keep state row slider container height aligned with the visible state-vector table.
   * Inputs: No direct parameters.
   * Returns: No value (`void`).
   * Side effects: Updates state row-slider inline height styles.
   */
  function updateRowSliderHeight() {
    if (!showRowSlider) {
      stateWindowControls.style.removeProperty('height');
      stateRowSlider.style.removeProperty('height');
      stateRowSlider.style.removeProperty('min-height');
      return;
    }

    const table = stateTableWrap.querySelector<HTMLTableElement>('table.markov-state-table');
    if (!table) {
      stateWindowControls.style.removeProperty('height');
      stateRowSlider.style.removeProperty('height');
      stateRowSlider.style.removeProperty('min-height');
      return;
    }

    const height = Math.max(0, Math.round(table.getBoundingClientRect().height));
    stateWindowControls.style.height = `${height}px`;
    stateRowSlider.style.height = 'auto';
    stateRowSlider.style.minHeight = '0px';
  }

  /**
   * Briefly pulse the "One" step button after a manual step dispatch.
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
   * Sync visual active states for step controls with controller-local flags.
   */
  function updateControlButtonStyles() {
    stepButton.classList.toggle('is-active', highlightOneStepButton);
    toggleAutoStepButton.classList.toggle('is-active', isAutoStepRunning);
    toggleAutoStepButton.setAttribute('aria-pressed', isAutoStepRunning ? 'true' : 'false');
  }
}

/**
 * Purpose: Build state-vector row markup for the current scope window and highlights.
 * Inputs: Render state/context and scoped window offsets.
 * Returns: HTML string for table rows.
 * Side effects: None (pure computation).
 */
function buildStateRowsMarkup(config: {
  state: AppState;
  context: PanelRenderContext;
  scopedNodeIndices: number[];
  rowWindowStart: number;
  windowSize: number;
}): string {
  if (config.scopedNodeIndices.length <= 0) {
    return `
      <tr>
        <td class="markov-window-empty" colspan="3">
          No nodes are currently visible in the graph viewport for this scope.
        </td>
      </tr>
    `;
  }

  const visibleNodeSet = new Set(config.context.viewportVisibleNodeIndices);
  const displayedNodeIndices = config.scopedNodeIndices.slice(
    config.rowWindowStart,
    config.rowWindowStart + config.windowSize
  );
  const isEditable = config.state.sourceMode === 'manual';

  return displayedNodeIndices
    .map((index) => {
      const value = selectDisplayedNodeValue(config.state, index);
      const isGraphInlineNodeEditing =
        config.state.editSession.mode === 'editing' &&
        config.state.editSession.ownerPanel === 'graph' &&
        config.state.editSession.activeTarget?.kind === 'node' &&
        config.state.editSession.activeTarget.index === index;
      const rowColor = computeStateRowHighlightColor({
        nodeIndex: index,
        nodeValue: value,
        activeTarget: config.context.activeTarget,
        visibleNodeSet,
      });
      const initialDisplayValue = selectDisplayedInitialValue(config.state, index);
      const currentDisplayValue = selectDisplayedNodeValue(config.state, index);
      const style = toStyleAttribute(rowColor);
      return `
        <tr>
          <th
            scope="row"
            data-graph-target-kind="node"
            data-node-index="${index}"
            ${style}
          >
            ${formatNodeLabelMarkup(index)}
          </th>
          <td ${style}>
            <input
              class="markov-number-input markov-number-input--state${isGraphInlineNodeEditing ? ' markov-input-caret-red' : ''}"
              data-kind="initial"
              data-index="${index}"
              data-graph-target-kind="node"
              data-node-index="${index}"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              value="${formatEditableInputValue(initialDisplayValue)}"
              aria-label="Initial probability for state ${index + 1}"
              ${isEditable ? '' : 'disabled aria-disabled="true"'}
            />
          </td>
          <td
            ${style}
            data-graph-target-kind="node"
            data-node-index="${index}"
          >
            <span
              class="markov-readonly-value"
              data-graph-target-kind="node"
              data-node-index="${index}"
            >
              ${currentDisplayValue.toFixed(4)}
            </span>
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Purpose: Derive state-row highlight colors with red-over-blue precedence.
 * Inputs: Node, active target, and visible-node context.
 * Returns: CSS color string or `null`.
 * Side effects: None (pure computation).
 */
function computeStateRowHighlightColor(options: {
  nodeIndex: number;
  nodeValue: number;
  activeTarget: GraphInteractionTarget | null;
  visibleNodeSet: ReadonlySet<number>;
}): string | null {
  const active = options.activeTarget;
  if (active?.kind === 'node' && active.nodeIndex === options.nodeIndex) {
    return colorForPanelRed(options.nodeValue, 0.52);
  }
  if (
    active?.kind === 'edge' &&
    (active.fromIndex === options.nodeIndex || active.toIndex === options.nodeIndex)
  ) {
    return colorForPanelRed(options.nodeValue, 0.52);
  }
  if (active?.kind === 'incoming-node' && active.nodeIndex === options.nodeIndex) {
    return colorForPanelRed(options.nodeValue, 0.52);
  }
  if (options.visibleNodeSet.has(options.nodeIndex)) {
    return colorForPanelBlue(options.nodeValue, 0.36);
  }
  return null;
}
