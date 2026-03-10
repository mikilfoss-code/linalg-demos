import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  formatIndexedMathSymbol,
  formatMathNumber,
  mathTextClassName,
} from '@shared/lib/math-text';
import { queueStaticMathLabels } from '@shared/lib/mathjax';
import { selectedBasisVector } from '../reducer';
import type { NetworksBus } from '../events';
import type { BasisSpace, NetworksState } from '../types';
import { NETWORKS_MATH_TEXT_STYLE } from '../math-style';

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
        Select a basis vector from
        <span
          class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
          data-math-tex="\\operatorname{row}(\\mathbf{\\mathsf{M}})"
          data-math-fallback="row(M)"
        >row(M)</span>,
        <span
          class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
          data-math-tex="\\operatorname{col}(\\mathbf{\\mathsf{M}})"
          data-math-fallback="col(M)"
        >col(M)</span>,
        <span
          class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
          data-math-tex="\\operatorname{null}(\\mathbf{\\mathsf{M}})"
          data-math-fallback="null(M)"
        >null(M)</span>,
        or
        <span
          class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
          data-math-tex="\\operatorname{null}(\\mathbf{\\mathsf{M}}^{T})"
          data-math-fallback="null(M^T)"
        >null(M^T)</span>
        to inspect it as a column vector.
      </p>

      <div class="networks-space-groups">
        <section class="networks-space-group">
          <h3 class="networks-subheading">
            <span
              class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
              data-math-tex="\\operatorname{row}(\\mathbf{\\mathsf{M}})"
              data-math-fallback="row(M)"
            >row(M)</span>
          </h3>
          <div id="row-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">
            <span
              class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
              data-math-tex="\\operatorname{col}(\\mathbf{\\mathsf{M}})"
              data-math-fallback="col(M)"
            >col(M)</span>
          </h3>
          <div id="column-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">
            <span
              class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
              data-math-tex="\\operatorname{null}(\\mathbf{\\mathsf{M}})"
              data-math-fallback="null(M)"
            >null(M)</span>
          </h3>
          <div id="null-space-buttons" class="networks-basis-buttons"></div>
        </section>
        <section class="networks-space-group">
          <h3 class="networks-subheading">
            <span
              class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}"
              data-math-tex="\\operatorname{null}(\\mathbf{\\mathsf{M}}^{T})"
              data-math-fallback="null(M^T)"
            >null(M^T)</span>
          </h3>
          <div id="left-null-space-buttons" class="networks-basis-buttons"></div>
        </section>
      </div>

      <section class="networks-selected-basis">
        <h3 class="networks-subheading">Selected Basis Vector</h3>
        <div id="selected-basis-vector"></div>
      </section>
    </section>
  `);
  queueStaticMathLabels({
    root: element,
    style: NETWORKS_MATH_TEXT_STYLE,
  });

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
    const trigger = target.closest<HTMLElement>('[data-action="select-basis"]');
    if (!trigger) {
      return;
    }

    const space = trigger.dataset.space as BasisSpace | undefined;
    const index = Number.parseInt(trigger.dataset.index ?? '', 10);
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
          <span class="networks-vector-name ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
            symbol: options.prefix,
            index: index + 1,
            style: NETWORKS_MATH_TEXT_STYLE,
            mode: 'html',
          })}</span>
        </button>
      `;
    })
    .join('');
}

function renderColumnVector(vector: readonly number[]): string {
  return `
    <div class="networks-column-vector-frame">
      <div class="networks-vector-label-column">
        ${vector
          .map((_, index) => {
            return `
              <div class="networks-vector-label-row networks-scalar-symbol ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
                symbol: 'a',
                index: index + 1,
                style: NETWORKS_MATH_TEXT_STYLE,
                mode: 'html',
              })}</div>
            `;
          })
          .join('')}
      </div>
      <div class="networks-vector-bracket networks-vector-bracket--values networks-vector-bracket--selected">
        ${vector
          .map((value) => {
            return `
              <div class="networks-vector-entry-row networks-vector-entry-row--readonly">
                <span class="networks-vector-value ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatMathNumber(value, 2)}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function labelForSelectedBasis(space: BasisSpace, index: number): string {
  const label = `<span class="networks-vector-name ${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
    symbol: space === 'left-null' ? 'ln' : space === 'row' ? 'r' : space === 'column' ? 'c' : 'n',
    index: index + 1,
    style: NETWORKS_MATH_TEXT_STYLE,
    mode: 'html',
  })}</span>`;
  if (space === 'row') {
    return `row basis vector ${label}`;
  }
  if (space === 'column') {
    return `col basis vector ${label}`;
  }
  if (space === 'left-null') {
    return `left null basis vector ${label}`;
  }
  return `null basis vector ${label}`;
}
