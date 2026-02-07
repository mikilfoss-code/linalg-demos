import { type DatasetId } from '../lib/types';
import { type DatasetOption } from './state';

let lastDatasetSelectSignature = '';

function buildSignature(options: DatasetOption[], selectedDataset: DatasetId): string {
  const optionsSig = options
    .map((option) => `${option.id}|${option.label}|${option.modality}`)
    .join(';');
  return `${selectedDataset}::${optionsSig}`;
}

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

