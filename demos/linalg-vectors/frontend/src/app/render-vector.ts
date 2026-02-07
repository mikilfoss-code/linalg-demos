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
  getWordWeight: (word: string) => number;
  setVectorHighlight: (word: string | null, weight: number) => void;
};

type VectorRenderer = {
  renderVector: (sample: DatasetSample | null, offset: number, meta: DatasetMeta | null) => void;
};

export function createVectorRenderer({
  vectorRangeEl,
  vectorSlider,
  vectorList,
  getActiveHighlightedWord,
  getWordWeight,
  setVectorHighlight,
}: VectorRendererDeps): VectorRenderer {
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

  function renderImageVector(sample: ImageSample, offset: number) {
    const vector = sample.vector;
    const clampedOffset = clampOffset(offset, vector.length);
    const end = Math.min(vector.length, clampedOffset + VECTOR_WINDOW);
    const sliderMax = getSliderMax(vector.length);

    vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
    vectorSlider.max = String(sliderMax);
    vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));

    vectorList.textContent = '';
    const fragment = document.createDocumentFragment();

    // Only render the active window to keep the DOM small and responsive.
    for (let i = clampedOffset; i < end; i += 1) {
      const value = vector[i];
      const row = document.createElement('div');
      row.className = 'vector-row';

      const indexEl = document.createElement('div');
      indexEl.className = 'vector-index';
      indexEl.textContent = String(i + 1);

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
    }

    vectorList.appendChild(fragment);
  }

  function renderTextVector(sample: TextSample, offset: number, meta: DatasetMeta) {
    const vectorLength = meta.vectorLength;
    const clampedOffset = clampOffset(offset, vectorLength);
    const end = Math.min(vectorLength, clampedOffset + VECTOR_WINDOW);
    const sliderMax = getSliderMax(vectorLength);

    vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
    vectorSlider.max = String(sliderMax);
    vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));

    const wordCounts = new Map<number, { count: number; weight: number }>();
    sample.wordCounts.forEach((entry) => {
      wordCounts.set(entry.index, { count: entry.count, weight: entry.weight });
    });

    vectorList.textContent = '';
    const fragment = document.createDocumentFragment();

    for (let i = clampedOffset; i < end; i += 1) {
      const row = document.createElement('div');
      row.className = 'vector-row is-text';
      row.dataset.index = String(i);

      const word = meta.vocab?.[i] ?? '';
      if (word) {
        row.dataset.word = word;
      }
      const entry = wordCounts.get(i);
      const count = entry?.count ?? 0;
      const weight = entry?.weight ?? 0;
      row.dataset.weight = String(weight);
      row.dataset.count = String(count);

      const indexEl = document.createElement('div');
      indexEl.className = 'vector-index';
      indexEl.textContent = String(i + 1);

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
    }

    vectorList.appendChild(fragment);
    const highlightedWord = getActiveHighlightedWord();
    if (highlightedWord) {
      setVectorHighlight(highlightedWord, getWordWeight(highlightedWord));
    }
  }

  return {
    renderVector,
  };
}
