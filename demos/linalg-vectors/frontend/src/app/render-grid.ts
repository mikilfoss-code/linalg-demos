import { toImageData, type DatasetMeta, type DatasetSample, type ImageSample, type TextSample } from '../lib/dataset';
import { isImageSample, isTextSample } from './state';

export function renderGrid(
  gridEl: HTMLDivElement,
  samples: DatasetSample[],
  selectedId: number | null,
  meta: DatasetMeta | null,
  sourceLabel: string
) {
  gridEl.textContent = '';
  if (!meta) return;
  if (meta.modality === 'text') {
    renderTextGrid(gridEl, samples.filter(isTextSample), selectedId, sourceLabel);
  } else {
    renderImageGrid(
      gridEl,
      samples.filter(isImageSample),
      selectedId,
      meta.imageWidth,
      meta.imageHeight,
      sourceLabel
    );
  }
}

function renderImageGrid(
  gridEl: HTMLDivElement,
  samples: ImageSample[],
  selectedId: number | null,
  imageWidth: number,
  imageHeight: number,
  sourceLabel: string
) {
  const fragment = document.createDocumentFragment();
  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mnist-tile';
    button.dataset.sampleId = String(i);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-pressed', i === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', i === selectedId);
    button.setAttribute('aria-label', `${sourceLabel} index ${sample.index}`);
    button.style.setProperty('--i', String(i));
    button.style.setProperty('--tile-aspect-ratio', `${imageWidth} / ${imageHeight}`);

    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.putImageData(toImageData(sample, imageWidth, imageHeight), 0, 0);
    }
    button.appendChild(canvas);
    fragment.appendChild(button);
  });
  gridEl.appendChild(fragment);
}

function renderTextGrid(
  gridEl: HTMLDivElement,
  samples: TextSample[],
  selectedId: number | null,
  sourceLabel: string
) {
  const fragment = document.createDocumentFragment();
  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mnist-tile text-tile';
    button.dataset.sampleId = String(i);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-pressed', i === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', i === selectedId);
    button.setAttribute('aria-label', `${sourceLabel} document ${sample.index}`);
    button.style.setProperty('--i', String(i));

    const snippet = document.createElement('div');
    snippet.className = 'text-snippet';
    snippet.textContent = sample.snippet || sample.rawText || '';
    button.appendChild(snippet);
    fragment.appendChild(button);
  });
  gridEl.appendChild(fragment);
}

export function updateGridSelection(gridEl: HTMLDivElement, selectedId: number | null) {
  const buttons = gridEl.querySelectorAll<HTMLButtonElement>('[data-sample-id]');
  buttons.forEach((button) => {
    const id = Number(button.dataset.sampleId);
    button.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', id === selectedId);
  });
}

