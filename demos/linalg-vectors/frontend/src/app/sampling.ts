import { loadDatasetSamples } from '../lib/dataset';
import { type Action, type AppState } from './state';

const MAX_APPEND_ATTEMPTS = 4;

function isAbortFailure(message: string): boolean {
  return /abort/i.test(message);
}

type SamplingDeps = {
  getState: () => AppState;
  dispatch: (action: Action) => void;
};

export function createSamplingController({ getState, dispatch }: SamplingDeps) {
  let sampleRequestId = 0;
  let isSampling = false;
  let activeAbort: AbortController | null = null;

  function nextSampleRequestId(): number {
    sampleRequestId += 1;
    return sampleRequestId;
  }

  function cancelPendingSampleRequest() {
    sampleRequestId += 1;
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
  }

  function trimSamples(targetCount: number) {
    const state = getState();
    if (state.samples.length <= targetCount) return;
    cancelPendingSampleRequest();
    dispatch({ type: 'samples-trim', targetSampleCount: targetCount });
  }

  async function appendSamples(missingCount: number, attempt = 0): Promise<void> {
    if (missingCount <= 0) return;
    if (isSampling) return;
    isSampling = true;
    const state = getState();
    const dataset = state.dataset;
    const requestId = nextSampleRequestId();
    const abortController = new AbortController();
    activeAbort = abortController;
    dispatch({ type: 'samples-start' });
    const result = await loadDatasetSamples(dataset, missingCount, undefined, abortController.signal);
    if (activeAbort === abortController) {
      activeAbort = null;
    }
    if (requestId !== sampleRequestId || abortController.signal.aborted) {
      isSampling = false;
      return;
    }
    if (!result.ok) {
      isSampling = false;
      if (isAbortFailure(result.error.message)) {
        return;
      }
      dispatch({ type: 'load-error', message: result.error.message });
      return;
    }
    dispatch({ type: 'samples-append', meta: result.value.meta, samples: result.value.samples });
    isSampling = false;

    const remaining = getState().targetSampleCount - getState().samples.length;
    if (remaining > 0 && attempt < MAX_APPEND_ATTEMPTS) {
      await appendSamples(remaining, attempt + 1);
    }
  }

  async function replaceSamples(count: number): Promise<void> {
    cancelPendingSampleRequest();
    isSampling = true;
    const state = getState();
    const dataset = state.dataset;
    const requestId = nextSampleRequestId();
    const abortController = new AbortController();
    activeAbort = abortController;
    dispatch({ type: 'samples-start' });
    const result = await loadDatasetSamples(dataset, count, undefined, abortController.signal);
    if (activeAbort === abortController) {
      activeAbort = null;
    }
    if (requestId !== sampleRequestId || abortController.signal.aborted) {
      isSampling = false;
      return;
    }
    if (!result.ok) {
      isSampling = false;
      if (isAbortFailure(result.error.message)) {
        return;
      }
      dispatch({ type: 'load-error', message: result.error.message });
      return;
    }
    dispatch({ type: 'samples-success', meta: result.value.meta, samples: result.value.samples });
    isSampling = false;
    await syncSamplesToTarget(getState().targetSampleCount);
  }

  async function syncSamplesToTarget(targetCount: number): Promise<void> {
    const state = getState();
    if (state.samples.length > targetCount) {
      trimSamples(targetCount);
      return;
    }
    const missing = targetCount - state.samples.length;
    if (missing > 0) {
      await appendSamples(missing);
    }
  }

  return {
    cancelPendingSampleRequest,
    replaceSamples,
    syncSamplesToTarget,
    trimSamples,
  };
}
