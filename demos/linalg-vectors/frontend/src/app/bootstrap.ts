import { listDatasets } from '../lib/api';
import { isDatasetOption, type Action, type DatasetOption } from './state';

type LayoutUpdateOptions = { syncSamples?: boolean };

type BootstrapDeps = {
  gridEl: HTMLDivElement;
  dispatch: (action: Action) => void;
  replaceSamples: (count: number) => Promise<void>;
  getTargetSampleCount: () => number;
  updateLayoutFromGridSize: (width: number, height: number, options?: LayoutUpdateOptions) => void;
  getGridTargetHeight: () => number;
};

export async function initializeVectorsApp({
  gridEl,
  dispatch,
  replaceSamples,
  getTargetSampleCount,
  updateLayoutFromGridSize,
  getGridTargetHeight,
}: BootstrapDeps): Promise<void> {
  dispatch({ type: 'load-start' });

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      const { width } = gridEl.getBoundingClientRect();
      updateLayoutFromGridSize(width, getGridTargetHeight(), { syncSamples: false });
      resolve();
    });
  });

  const catalog = await listDatasets();
  if (!catalog.ok) {
    dispatch({ type: 'load-error', message: catalog.error.message });
    return;
  }

  const datasetOptions: DatasetOption[] = catalog.value.datasets.map((dataset) => ({
    id: dataset.id,
    label: dataset.displayName || dataset.id,
    modality: dataset.modality,
  }));
  if (!datasetOptions.length) {
    dispatch({ type: 'load-error', message: 'No datasets available from backend.' });
    return;
  }

  let defaultDataset = catalog.value.defaultDataset;
  if (!isDatasetOption(defaultDataset, datasetOptions)) {
    defaultDataset = datasetOptions[0].id;
  }

  dispatch({
    type: 'catalog-success',
    dataset: defaultDataset,
    datasetOptions,
  });
  await replaceSamples(getTargetSampleCount());
}
