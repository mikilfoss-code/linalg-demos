import { VECTOR_WINDOW } from './constants';
import {
  clampOffset,
  getActiveModality,
  getSelectedSample,
  getSelectedVectorLength,
  isDatasetOption,
  sliderValueToOffset,
  type Action,
  type AppState,
} from './state';
import { type TextHighlightingController } from './text-highlighting';

type LayoutUpdateOptions = { syncSamples?: boolean };

type AppEventDeps = {
  gridEl: HTMLDivElement;
  vectorSlider: HTMLInputElement;
  vectorList: HTMLDivElement;
  selectedTextContent: HTMLDivElement;
  datasetSelect: HTMLSelectElement;
  resampleBtn: HTMLButtonElement;
  getState: () => AppState;
  dispatch: (action: Action) => void;
  replaceSamples: (count: number) => Promise<void>;
  updateLayoutFromGridSize: (width: number, height: number, options?: LayoutUpdateOptions) => void;
  getGridTargetHeight: () => number;
  textHighlighting: TextHighlightingController;
};

export function attachAppEventHandlers({
  gridEl,
  vectorSlider,
  vectorList,
  selectedTextContent,
  datasetSelect,
  resampleBtn,
  getState,
  dispatch,
  replaceSamples,
  updateLayoutFromGridSize,
  getGridTargetHeight,
  textHighlighting,
}: AppEventDeps): () => void {
  // ResizeObserver keeps the grid layout responsive without polling.
  const gridObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target !== gridEl) return;
      const state = getState();
      updateLayoutFromGridSize(entry.contentRect.width, getGridTargetHeight(), {
        syncSamples: state.meta !== null,
      });
    });
  });
  gridObserver.observe(gridEl);

  const onWindowResize = () => {
    const state = getState();
    const { width } = gridEl.getBoundingClientRect();
    updateLayoutFromGridSize(width, getGridTargetHeight(), {
      syncSamples: state.meta !== null,
    });
  };
  window.addEventListener('resize', onWindowResize);

  const onGridClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-sample-id]');
    if (!button) return;
    const id = Number(button.dataset.sampleId);
    if (Number.isNaN(id)) return;
    dispatch({ type: 'select', id });
  };
  gridEl.addEventListener('click', onGridClick);

  const onVectorSliderInput = (event: Event) => {
    const state = getState();
    const selected = getSelectedSample(state);
    const vectorLength = getSelectedVectorLength(state, selected);
    if (!selected || vectorLength <= 0) return;
    const rawValue = Number((event.target as HTMLInputElement).value);
    const sliderMax = Number(vectorSlider.max) || 0;
    const nextOffset = clampOffset(sliderValueToOffset(rawValue, sliderMax), vectorLength);
    dispatch({ type: 'set-offset', offset: nextOffset });
  };
  vectorSlider.addEventListener('input', onVectorSliderInput);

  const onVectorWheel = (event: Event) => {
    const wheelEvent = event as WheelEvent;
    wheelEvent.preventDefault();
    const delta = Math.sign(wheelEvent.deltaY);
    if (delta !== 0) {
      dispatch({ type: 'shift-offset', delta });
    }
  };
  const wheelOptions: AddEventListenerOptions = { passive: false };
  vectorList.addEventListener('wheel', onVectorWheel, wheelOptions);

  const onVectorKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      dispatch({ type: 'shift-offset', delta: 1 });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({ type: 'shift-offset', delta: -1 });
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      dispatch({ type: 'shift-offset', delta: VECTOR_WINDOW });
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      dispatch({ type: 'shift-offset', delta: -VECTOR_WINDOW });
    } else if (event.key === 'Home') {
      event.preventDefault();
      dispatch({ type: 'set-offset', offset: 0 });
    } else if (event.key === 'End') {
      event.preventDefault();
      const state = getState();
      const selected = getSelectedSample(state);
      const vectorLength = getSelectedVectorLength(state, selected);
      if (!selected || vectorLength <= 0) return;
      dispatch({
        type: 'set-offset',
        offset: Math.max(0, vectorLength - VECTOR_WINDOW),
      });
    }
  };
  vectorList.addEventListener('keydown', onVectorKeyDown);

  const onVectorPointerOver = (event: PointerEvent) => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>('.vector-row.is-text');
    if (!row) return;
    const count = Number(row.dataset.count) || 0;
    if (count <= 0) {
      textHighlighting.clearTextHighlight();
      textHighlighting.clearVectorHighlight();
      return;
    }
    const word = row.dataset.word;
    const weight = Number(row.dataset.weight) || 0;
    if (word) {
      textHighlighting.setTextHighlight(word, weight);
    }
  };
  vectorList.addEventListener('pointerover', onVectorPointerOver);

  const onVectorPointerLeave = () => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    textHighlighting.clearTextHighlight();
    textHighlighting.clearVectorHighlight();
  };
  vectorList.addEventListener('pointerleave', onVectorPointerLeave);

  const onVectorClick = (event: MouseEvent) => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>('.vector-row.is-text');
    if (!row) return;
    const word = row.dataset.word;
    if (!word) return;
    const firstSpan = textHighlighting.getFirstTextSpan(word);
    if (firstSpan) {
      firstSpan.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  vectorList.addEventListener('click', onVectorClick);

  const onTextClick = (event: MouseEvent) => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    const target = event.target as HTMLElement | null;
    const wordEl = target?.closest<HTMLSpanElement>('.text-word');
    if (!wordEl) return;
    const word = wordEl.dataset.word;
    if (!word) return;
    const index = Number(wordEl.dataset.index);
    if (!Number.isFinite(index)) return;
    const vectorLength = state.meta?.vectorLength ?? 0;
    if (vectorLength <= 0) return;
    dispatch({ type: 'set-offset', offset: clampOffset(index, vectorLength) });
    const weight = textHighlighting.getWordWeight(word);
    if (weight > 0) {
      textHighlighting.setTextHighlight(word, weight);
    }
  };
  selectedTextContent.addEventListener('click', onTextClick);

  const onTextPointerOver = (event: PointerEvent) => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    const target = event.target as HTMLElement | null;
    const wordEl = target?.closest<HTMLSpanElement>('.text-word');
    if (!wordEl) return;
    const word = wordEl.dataset.word;
    if (!word) return;
    const weight = textHighlighting.getWordWeight(word);
    textHighlighting.setTextHighlight(word, weight);
  };
  selectedTextContent.addEventListener('pointerover', onTextPointerOver);

  const onTextPointerLeave = () => {
    const state = getState();
    if (getActiveModality(state) !== 'text') return;
    textHighlighting.clearTextHighlight();
    textHighlighting.clearVectorHighlight();
  };
  selectedTextContent.addEventListener('pointerleave', onTextPointerLeave);

  const onDatasetChange = (event: Event) => {
    const state = getState();
    const nextDataset = (event.target as HTMLSelectElement).value;
    if (!isDatasetOption(nextDataset, state.datasetOptions) || nextDataset === state.dataset) {
      datasetSelect.value = state.dataset;
      return;
    }

    dispatch({ type: 'dataset-change', dataset: nextDataset });
    void replaceSamples(state.targetSampleCount);
  };
  datasetSelect.addEventListener('change', onDatasetChange);

  const onResampleClick = () => {
    const state = getState();
    void replaceSamples(state.targetSampleCount);
  };
  resampleBtn.addEventListener('click', onResampleClick);

  return () => {
    gridObserver.disconnect();
    window.removeEventListener('resize', onWindowResize);
    gridEl.removeEventListener('click', onGridClick);
    vectorSlider.removeEventListener('input', onVectorSliderInput);
    vectorList.removeEventListener('wheel', onVectorWheel, wheelOptions);
    vectorList.removeEventListener('keydown', onVectorKeyDown);
    vectorList.removeEventListener('pointerover', onVectorPointerOver);
    vectorList.removeEventListener('pointerleave', onVectorPointerLeave);
    vectorList.removeEventListener('click', onVectorClick);
    selectedTextContent.removeEventListener('click', onTextClick);
    selectedTextContent.removeEventListener('pointerover', onTextPointerOver);
    selectedTextContent.removeEventListener('pointerleave', onTextPointerLeave);
    datasetSelect.removeEventListener('change', onDatasetChange);
    resampleBtn.removeEventListener('click', onResampleClick);
  };
}
