import {
  type DatasetMeta,
  type DatasetSample,
  type ImageSample,
  type TextSample,
} from '../lib/dataset';
import { VECTOR_WINDOW } from './constants';
import {
  clampOffset,
  getSliderMax,
  isImageSample,
  isTextSample,
  offsetToSliderValue,
} from './state';

type VectorRendererDeps = {
  vectorRangeEl: HTMLDivElement;
  vectorSlider: HTMLInputElement;
  vectorList: HTMLDivElement;
  getActiveHighlightedWord: () => string | null;
  getActiveImagePixelIndex: () => number | null;
  getWordWeight: (word: string) => number;
  setVectorHighlight: (word: string | null, weight: number) => void;
};

type VectorRenderer = {
  renderVector: (sample: DatasetSample | null, offset: number, meta: DatasetMeta | null) => void;
};

/**
 * Create the renderer responsible for vector window header, slider, and rows.
 *
 * @param vectorRangeEl - Header element showing the visible component range.
 * @param vectorSlider - Vertical slider controlling vector offset.
 * @param vectorList - Container where vector rows are rendered.
 * @param getActiveHighlightedWord - Function returning the currently highlighted text token.
 * @param getActiveImagePixelIndex - Function returning highlighted image pixel index.
 * @param getWordWeight - Function returning highlight intensity for a word.
 * @param setVectorHighlight - Function that applies text-mode vector highlights.
 * @returns An object exposing `renderVector(...)` for full vector window rendering.
 */
export function createVectorRenderer({
  vectorRangeEl,
  vectorSlider,
  vectorList,
  getActiveHighlightedWord,
  getActiveImagePixelIndex,
  getWordWeight,
  setVectorHighlight,
}: VectorRendererDeps): VectorRenderer {
  type RowRenderer = (index: number, fragment: DocumentFragment) => void;

  /**
   * Render the current VECTOR_WINDOW slice and synchronize slider/header state.
   *
   * @param offset - Requested vector start index.
   * @param vectorLength - Total vector length for the selected sample.
   * @param rowRenderer - Callback used to append one row per index.
   * @param afterRender - Optional callback run after DOM rows are appended.
   * @returns Nothing. Mutates vector range, slider, and list DOM nodes.
   */
  function renderVectorWindow(
    offset: number,
    vectorLength: number,
    rowRenderer: RowRenderer,
    afterRender?: () => void
  ) {
    const clampedOffset = clampOffset(offset, vectorLength);
    const end = Math.min(vectorLength, clampedOffset + VECTOR_WINDOW);
    const sliderMax = getSliderMax(vectorLength);

    vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
    vectorSlider.max = String(sliderMax);
    vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));

    vectorList.textContent = '';
    const fragment = document.createDocumentFragment();
    for (let i = clampedOffset; i < end; i += 1) {
      rowRenderer(i, fragment);
    }
    vectorList.appendChild(fragment);
    afterRender?.();
  }

  /**
   * Render vector UI for the selected sample.
   *
   * @param sample - Selected sample or `null` when no selection exists.
   * @param offset - Current window offset.
   * @param meta - Dataset metadata used to resolve modality and vector length.
   * @returns Nothing. Updates vector UI elements.
   */
  function renderVector(sample: DatasetSample | null, offset: number, meta: DatasetMeta | null) {
    if (!sample || !meta) {
      vectorRangeEl.textContent = 'Components --';
      vectorSlider.value = '0';
      vectorSlider.max = '0';
      // vectorList.innerHTML = `<div class="vector-empty">Select a sample to view its vector.</div>`;
      return;
    }

    if (meta.modality === 'text' && isTextSample(sample)) {
      renderTextVector(sample, offset, meta);
    } else if (isImageSample(sample)) {
      renderImageVector(sample, offset);
    }
  }

  /**
   * Render image-mode vector rows with grayscale swatches.
   *
   * @param sample - Selected image sample.
   * @param offset - Current vector window offset.
   * @returns Nothing. Appends image-mode rows into the vector list.
   */
  function renderImageVector(sample: ImageSample, offset: number) {
    const vector = sample.vector;
    const highlightedPixelIndex = getActiveImagePixelIndex();
    renderVectorWindow(offset, vector.length, (index, fragment) => {
      const value = vector[index];
      const row = document.createElement('div');
      row.className = 'vector-row is-image';
      row.dataset.index = String(index);
      if (highlightedPixelIndex === index) {
        row.classList.add('is-highlighted');
      }

      const indexEl = document.createElement('div');
      indexEl.className = 'vector-index';
      indexEl.textContent = String(index + 1);

      const valueEl = document.createElement('div');
      valueEl.className = 'vector-value';
      valueEl.textContent = value.toFixed(3);

      const swatch = document.createElement('div');
      swatch.className = 'vector-swatch';
      // Map the 0..1 vector value back to a grayscale pixel color.
      const clamped = Math.min(Math.max(value, 0), 1);
      const channel = Math.round(clamped * 255);
      swatch.style.backgroundColor = `rgb(${channel}, ${channel}, ${channel})`;

      row.appendChild(indexEl);
      row.appendChild(swatch);
      row.appendChild(valueEl);
      fragment.appendChild(row);
    });
  }

  /**
   * Render text-mode vector rows with word and count columns.
   *
   * @param sample - Selected text sample.
   * @param offset - Current vector window offset.
   * @param meta - Dataset metadata containing vocabulary and vector length.
   * @returns Nothing. Appends text-mode rows into the vector list.
   */
  function renderTextVector(sample: TextSample, offset: number, meta: DatasetMeta) {
    const vectorLength = meta.vectorLength;

    const wordCounts = new Map<number, { count: number; weight: number }>();
    sample.wordCounts.forEach((entry) => {
      wordCounts.set(entry.index, { count: entry.count, weight: entry.weight });
    });
    renderVectorWindow(
      offset,
      vectorLength,
      (index, fragment) => {
        const row = document.createElement('div');
        row.className = 'vector-row is-text';
        row.dataset.index = String(index);

        const word = meta.vocab?.[index] ?? '';
        if (word) {
          row.dataset.word = word;
        }
        const entry = wordCounts.get(index);
        const count = entry?.count ?? 0;
        const weight = entry?.weight ?? 0;
        row.dataset.weight = String(weight);
        row.dataset.count = String(count);

        const indexEl = document.createElement('div');
        indexEl.className = 'vector-index';
        indexEl.textContent = String(index + 1);

        const wordEl = document.createElement('div');
        wordEl.className = 'vector-word';
        wordEl.textContent = word || '--';

        const countEl = document.createElement('div');
        countEl.className = 'vector-count';
        countEl.textContent = String(count);

        row.appendChild(indexEl);
        row.appendChild(wordEl);
        row.appendChild(countEl);
        fragment.appendChild(row);
      },
      () => {
        const highlightedWord = getActiveHighlightedWord();
        if (highlightedWord) {
          setVectorHighlight(highlightedWord, getWordWeight(highlightedWord));
        }
      }
    );
  }

  return {
    renderVector,
  };
}
