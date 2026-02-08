import { toImageData, type DatasetMeta, type DatasetSample, type ImageSample, type TextSample } from '../lib/dataset';
import { isImageSample, isTextSample } from './state';

/**
 * Render the sample grid for the active modality.
 *
 * @param gridEl - Grid container element.
 * @param samples - Mixed list of sampled items from app state.
 * @param selectedId - Selected sample index in the current grid.
 * @param meta - Dataset metadata that indicates modality and geometry.
 * @param sourceLabel - Human-readable dataset label for accessibility text.
 * @returns Nothing. Mutates `gridEl` contents.
 */
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

/**
 * Render image dataset tiles into the sample grid.
 *
 * @param gridEl - Grid container element.
 * @param samples - Image samples to display.
 * @param selectedId - Currently selected sample id.
 * @param imageWidth - Pixel width of each image sample.
 * @param imageHeight - Pixel height of each image sample.
 * @param sourceLabel - Dataset label used for aria text.
 * @returns Nothing. Appends buttons and canvases to `gridEl`.
 */
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

/**
 * Render text dataset tiles into the sample grid.
 *
 * @param gridEl - Grid container element.
 * @param samples - Text samples to display.
 * @param selectedId - Currently selected sample id.
 * @param sourceLabel - Dataset label used for aria text.
 * @returns Nothing. Appends buttons with text snippets to `gridEl`.
 */
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

/**
 * Update selected-state styling and ARIA flags without rebuilding the grid.
 *
 * @param gridEl - Grid container element.
 * @param selectedId - Newly selected sample id.
 * @returns Nothing. Mutates existing button attributes/classes.
 */
export function updateGridSelection(gridEl: HTMLDivElement, selectedId: number | null) {
  const buttons = gridEl.querySelectorAll<HTMLButtonElement>('[data-sample-id]');
  buttons.forEach((button) => {
    const id = Number(button.dataset.sampleId);
    button.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', id === selectedId);
  });
}
