import { createTemplateElement, requireElement } from '@shared/lib/dom';
import { selectedBasisVector } from '../reducer';
import type { NetworksBus } from '../events';
import type { BasisSpace, NetworksState } from '../types';

export type SpacesPanelController = {
  element: HTMLElement;
  destroy: () => void;
};

/**
 * Create panel for row/column/null/left-null space basis display and selection.
 */
export function createSpacesPanelController(bus: NetworksBus): SpacesPanelController {
  const element = createTemplateElement<HTMLElement>(`
    <section class="base-panel networks-panel networks-panel-spaces">
      <h2 class="base-panel-title">Space Bases</h2>
      <p class="networks-panel-subtitle">
        Select a basis vector from row space, column space, null space, or left null space to inspect it as a column vector.
      </p>

      <div class="networks-space-groups">
        <section class="networks-space-group">
          <h3 class="networks-subheading">Row Space of M</h3>
          <div id="row-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">Column Space of M</h3>
          <div id="column-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">Null Space of M</h3>
          <div id="null-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">Left Null Space of M</h3>
          <div id="left-null-space-buttons" class="networks-basis-buttons"></div>
        </section>
      </div>

      <section class="networks-selected-basis">
        <h3 class="networks-subheading">Selected Basis Vector</h3>
        <div id="selected-basis-vector"></div>
      </section>
    </section>
  `);

  const rowButtonsEl = requireElement<HTMLElement>(element, '#row-space-buttons');
  const columnButtonsEl = requireElement<HTMLElement>(element, '#column-space-buttons');
  const nullButtonsEl = requireElement<HTMLElement>(element, '#null-space-buttons');
  const leftNullButtonsEl = requireElement<HTMLElement>(element, '#left-null-space-buttons');
  const selectedVectorEl = requireElement<HTMLElement>(element, '#selected-basis-vector');

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.action !== 'select-basis') {
      return;
    }

    const space = target.dataset.space as BasisSpace | undefined;
    const index = Number.parseInt(target.dataset.index ?? '', 10);
    if (!space || !Number.isInteger(index)) {
      return;
    }
    if (space !== 'row' && space !== 'column' && space !== 'null' && space !== 'left-null') {
      return;
    }
    bus.emit('command:select-basis', { space, index });
  };

  element.addEventListener('click', handleClick);

  const unsubscribe = bus.on('state:changed', (state) => {
    renderSpacesPanel(state);
  });

  return {
    element,
    destroy() {
      unsubscribe();
      element.removeEventListener('click', handleClick);
    },
  };

  function renderSpacesPanel(state: NetworksState): void {
    rowButtonsEl.innerHTML = renderBasisButtons({
      vectors: state.derived.basis.row,
      space: 'row',
      selected: state.selectedBasis,
      prefix: 'r',
      emptyMessage: 'Only the zero vector is in the row space.',
    });
    columnButtonsEl.innerHTML = renderBasisButtons({
      vectors: state.derived.basis.column,
      space: 'column',
      selected: state.selectedBasis,
      prefix: 'c',
      emptyMessage: 'Only the zero vector is in the column space.',
    });
    nullButtonsEl.innerHTML = renderBasisButtons({
      vectors: state.derived.basis.null,
      space: 'null',
      selected: state.selectedBasis,
      prefix: 'n',
      emptyMessage: 'Null space basis is empty (only the zero vector).',
    });
    leftNullButtonsEl.innerHTML = renderBasisButtons({
      vectors: state.derived.basis.leftNull,
      space: 'left-null',
      selected: state.selectedBasis,
      prefix: 'ln',
      emptyMessage: 'Left null space basis is empty (only the zero vector).',
    });

    const vector = selectedBasisVector(state);
    if (!vector || !state.selectedBasis) {
      selectedVectorEl.innerHTML = '<p class="networks-empty">Choose a basis vector button.</p>';
      return;
    }

    selectedVectorEl.innerHTML = `
      <div class="networks-basis-selected-meta">
        ${labelForSelectedBasis(state.selectedBasis.space, state.selectedBasis.index)}
      </div>
      ${renderColumnVector(vector)}
    `;
  }
}

function renderBasisButtons(options: {
  vectors: readonly number[][];
  space: BasisSpace;
  selected: { space: BasisSpace; index: number } | null;
  prefix: string;
  emptyMessage: string;
}): string {
  if (options.vectors.length === 0) {
    return `<p class="networks-empty">${options.emptyMessage}</p>`;
  }

  return options.vectors
    .map((_, index) => {
      const isActive = options.selected?.space === options.space && options.selected.index === index;
      return `
        <button
          class="base-button base-button--secondary networks-basis-button${isActive ? ' is-active' : ''}"
          type="button"
          data-action="select-basis"
          data-space="${options.space}"
          data-index="${index}"
          aria-pressed="${isActive ? 'true' : 'false'}"
        >
          ${options.prefix}${index + 1}
        </button>
      `;
    })
    .join('');
}

function renderColumnVector(vector: readonly number[]): string {
  return `
    <div class="networks-vector-bracket networks-vector-bracket--selected">
      ${vector
        .map((value, index) => {
          return `
            <div class="networks-vector-row networks-vector-row--readonly">
              <span class="networks-vector-label">${index + 1}</span>
              <span class="networks-vector-value">${formatNumber(value)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function labelForSelectedBasis(space: BasisSpace, index: number): string {
  if (space === 'row') {
    return `Row basis vector r${index + 1}`;
  }
  if (space === 'column') {
    return `Column basis vector c${index + 1}`;
  }
  if (space === 'left-null') {
    return `Left null basis vector ln${index + 1}`;
  }
  return `Null basis vector n${index + 1}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}
