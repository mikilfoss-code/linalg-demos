import { listDatasets } from '../lib/api';
import { isDatasetOption, type Action, type DatasetOption } from './state';

type LayoutUpdateOptions = { syncSamples?: boolean };

/**
 * Purpose: BootstrapDeps object contract.
 * Key fields: Properties declared inside this type definition.
 */
type BootstrapDeps = {
  gridEl: HTMLDivElement;
  dispatch: (action: Action) => void;
  replaceSamples: (count: number) => Promise<void>;
  getTargetSampleCount: () => number;
  updateLayoutFromGridSize: (width: number, height: number, options?: LayoutUpdateOptions) => void;
  getGridTargetHeight: () => number;
};

/**
 * Bootstrap the vectors demo.
 *
 * @param gridEl - Grid container used for initial layout measurement.
 * @param dispatch - State reducer dispatcher.
 * @param replaceSamples - Function that replaces the current sample set.
 * @param getTargetSampleCount - Function that returns the current sample target.
 * @param updateLayoutFromGridSize - Function that recomputes responsive layout.
 * @param getGridTargetHeight - Function that returns desired grid height.
 * @returns A promise that resolves after catalog load and initial sampling complete.
 */
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
