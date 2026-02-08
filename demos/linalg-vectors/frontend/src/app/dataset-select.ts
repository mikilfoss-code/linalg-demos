import { type DatasetId } from '../lib/types';
import { type DatasetOption } from './state';

let lastDatasetSelectSignature = '';

/**
 * Build a stable signature for select options and active dataset.
 *
 * @param options - Available dataset options rendered in the select.
 * @param selectedDataset - Currently selected dataset id.
 * @returns Deterministic signature string used to skip redundant rerenders.
 */
function buildSignature(options: DatasetOption[], selectedDataset: DatasetId): string {
  const optionsSig = options
    .map((option) => `${option.id}|${option.label}|${option.modality}`)
    .join(';');
  return `${selectedDataset}::${optionsSig}`;
}

/**
 * Render dataset options only when the source catalog actually changes.
 *
 * @param selectEl - Dataset `<select>` element.
 * @param options - Catalog options returned by the backend.
 * @param selectedDataset - Dataset id that should be selected after render.
 * @returns Nothing. Mutates `selectEl` options and selected value.
 */
export function renderDatasetOptions(
  selectEl: HTMLSelectElement,
  options: DatasetOption[],
  selectedDataset: DatasetId
) {
  const signature = buildSignature(options, selectedDataset);
  if (signature === lastDatasetSelectSignature) {
    if (selectEl.value !== selectedDataset) {
      selectEl.value = selectedDataset;
    }
    return;
  }

  selectEl.textContent = '';
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.id;
    optionEl.textContent = option.label;
    fragment.appendChild(optionEl);
  });
  selectEl.appendChild(fragment);
  selectEl.value = selectedDataset;
  lastDatasetSelectSignature = signature;
}
