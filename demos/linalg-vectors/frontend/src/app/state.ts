import {
  type DatasetMeta,
  type DatasetSample,
  type ImageSample,
  type TextSample,
} from '../lib/dataset';
import { type DatasetId, type DatasetModality } from '../lib/types';
import { VECTOR_WINDOW } from './constants';

export type GridLayout = { columns: number; rows: number };
export type DatasetOption = { id: DatasetId; label: string; modality: DatasetModality };

export type AppStatus = 'loading' | 'ready' | 'error';

export type AppState = {
  status: AppStatus;
  dataset: DatasetId;
  datasetOptions: DatasetOption[];
  meta: DatasetMeta | null;
  samples: DatasetSample[];
  selectedId: number | null;
  vectorOffset: number;
  gridLayout: GridLayout;
  targetSampleCount: number;
  error?: string;
};

export type Action =
  | { type: 'load-start' }
  | { type: 'catalog-success'; dataset: DatasetId; datasetOptions: DatasetOption[] }
  | { type: 'load-success'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'load-error'; message: string }
  | { type: 'dataset-change'; dataset: DatasetId }
  | { type: 'samples-start' }
  | { type: 'samples-success'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'samples-append'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'samples-trim'; targetSampleCount: number }
  | { type: 'layout-change'; layout: GridLayout; targetSampleCount: number }
  | { type: 'select'; id: number }
  | { type: 'set-offset'; offset: number }
  | { type: 'shift-offset'; delta: number };

export function getDatasetLabel(dataset: DatasetId, options: DatasetOption[]): string {
  return options.find((option) => option.id === dataset)?.label ?? dataset;
}

export function getDatasetModality(
  dataset: DatasetId,
  options: DatasetOption[]
): DatasetModality | null {
  return options.find((option) => option.id === dataset)?.modality ?? null;
}

export function isDatasetOption(value: string, options: DatasetOption[]): value is DatasetId {
  return options.some((option) => option.id === value);
}

export function isImageSample(sample: DatasetSample | null): sample is ImageSample {
  return sample?.kind === 'image';
}

export function isTextSample(sample: DatasetSample | null): sample is TextSample {
  return sample?.kind === 'text';
}

export function getActiveModality(current: AppState): DatasetModality | null {
  return current.meta?.modality ?? getDatasetModality(current.dataset, current.datasetOptions);
}

export function clampOffset(offset: number, vectorLength: number): number {
  const maxOffset = Math.max(0, vectorLength - VECTOR_WINDOW);
  return Math.min(Math.max(offset, 0), maxOffset);
}

export function getSliderMax(vectorLength: number): number {
  return Math.max(0, vectorLength - VECTOR_WINDOW);
}

// Invert slider values so the top position maps to offset 0.
export function offsetToSliderValue(offset: number, sliderMax: number): number {
  return sliderMax - offset;
}

export function sliderValueToOffset(value: number, sliderMax: number): number {
  return sliderMax - value;
}

export function getSelectedSample(current: AppState): DatasetSample | null {
  if (current.selectedId === null) return null;
  return current.samples[current.selectedId] ?? null;
}

export function getSelectedVectorLength(current: AppState, selected: DatasetSample | null): number {
  if (!selected || !current.meta) return 0;
  if (current.meta.modality === 'text') {
    return current.meta.vectorLength;
  }
  if (isImageSample(selected)) {
    return selected.vector.length;
  }
  return current.meta.vectorLength;
}

function dedupeSamples(existing: DatasetSample[], incoming: DatasetSample[]): DatasetSample[] {
  if (!incoming.length) return [];
  const existingIds = new Set(existing.map((sample) => sample.index));
  const unique: DatasetSample[] = [];
  for (const sample of incoming) {
    if (!existingIds.has(sample.index)) {
      existingIds.add(sample.index);
      unique.push(sample);
    }
  }
  return unique;
}

export function reducer(current: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load-start':
      return { ...current, status: 'loading', error: undefined };
    case 'catalog-success':
      return {
        ...current,
        status: 'loading',
        dataset: action.dataset,
        datasetOptions: action.datasetOptions,
        meta: null,
        samples: [],
        selectedId: null,
        vectorOffset: 0,
        error: undefined,
      };
    case 'load-success':
      return {
        status: 'ready',
        dataset: current.dataset,
        datasetOptions: current.datasetOptions,
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
        gridLayout: current.gridLayout,
        targetSampleCount: current.targetSampleCount,
      };
    case 'load-error':
      return { ...current, status: 'error', error: action.message };
    case 'dataset-change':
      return {
        ...current,
        dataset: action.dataset,
        status: 'loading',
        meta: null,
        samples: [],
        selectedId: null,
        vectorOffset: 0,
        error: undefined,
      };
    case 'samples-start':
      return { ...current, status: 'loading', error: undefined };
    case 'samples-success':
      return {
        ...current,
        status: 'ready',
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
      };
    case 'samples-append': {
      const uniqueIncoming = dedupeSamples(current.samples, action.samples);
      const nextSamples = [...current.samples, ...uniqueIncoming];
      const nextSelected = current.selectedId ?? (nextSamples.length ? 0 : null);
      return {
        ...current,
        status: 'ready',
        meta: action.meta,
        samples: nextSamples,
        selectedId: nextSelected,
      };
    }
    case 'samples-trim': {
      const nextSamples = current.samples.slice(0, action.targetSampleCount);
      let nextSelectedId = current.selectedId;
      if (!nextSamples.length) {
        nextSelectedId = null;
      } else if (nextSelectedId === null || nextSelectedId >= nextSamples.length) {
        nextSelectedId = nextSamples.length - 1;
      }
      const nextOffset = nextSelectedId !== current.selectedId ? 0 : current.vectorOffset;
      return {
        ...current,
        status: current.status === 'error' ? 'error' : 'ready',
        samples: nextSamples,
        selectedId: nextSelectedId,
        vectorOffset: nextOffset,
      };
    }
    case 'layout-change':
      return {
        ...current,
        gridLayout: action.layout,
        targetSampleCount: action.targetSampleCount,
      };
    case 'select':
      return {
        ...current,
        selectedId: action.id,
        vectorOffset: 0,
      };
    case 'set-offset': {
      const selected = getSelectedSample(current);
      const vectorLength = getSelectedVectorLength(current, selected);
      if (!selected || vectorLength <= 0) return current;
      const nextOffset = clampOffset(action.offset, vectorLength);
      return { ...current, vectorOffset: nextOffset };
    }
    case 'shift-offset': {
      const selected = getSelectedSample(current);
      const vectorLength = getSelectedVectorLength(current, selected);
      if (!selected || vectorLength <= 0) return current;
      const nextOffset = clampOffset(current.vectorOffset + action.delta, vectorLength);
      return { ...current, vectorOffset: nextOffset };
    }
    default:
      return current;
  }
}

