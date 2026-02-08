import { loadDatasetSamples } from '../lib/dataset';
import { type Action, type AppState } from './state';

const MAX_APPEND_ATTEMPTS = 4;

/**
 * Detect whether an error message corresponds to an aborted request.
 *
 * @param message - Error message text from a failed request.
 * @returns `true` when the failure looks like cancellation/abort.
 */
function isAbortFailure(message: string): boolean {
  return /abort/i.test(message);
}

type SamplingDeps = {
  getState: () => AppState;
  dispatch: (action: Action) => void;
};

/**
 * Create the sampling workflow controller used by the vectors app.
 *
 * @param getState - Function returning latest application state.
 * @param dispatch - Reducer dispatch function.
 * @returns Sampling helpers for replace/append/trim/cancel flows.
 */
export function createSamplingController({ getState, dispatch }: SamplingDeps) {
  let sampleRequestId = 0;
  let isSampling = false;
  let activeAbort: AbortController | null = null;

  function nextSampleRequestId(): number {
    sampleRequestId += 1;
    return sampleRequestId;
  }

  /**
   * Cancel any in-flight sampling request and invalidate stale request IDs.
   *
   * @returns Nothing.
   */
  function cancelPendingSampleRequest() {
    sampleRequestId += 1;
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
  }

  /**
   * Trim sample list when layout target shrinks.
   *
   * @param targetCount - Desired post-trim sample count.
   * @returns Nothing.
   */
  function trimSamples(targetCount: number) {
    const state = getState();
    if (state.samples.length <= targetCount) return;
    cancelPendingSampleRequest();
    dispatch({ type: 'samples-trim', targetSampleCount: targetCount });
  }

  /**
   * Append additional samples until target count is reached or retry limit is hit.
   *
   * @param missingCount - Number of additional samples required.
   * @param attempt - Current append retry attempt.
   * @returns Promise that resolves when append cycle finishes.
   */
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

  /**
   * Replace current sample set with a fresh sample request.
   *
   * @param count - Number of samples to request.
   * @returns Promise that resolves after replacement and reconciliation.
   */
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

  /**
   * Reconcile current sample count with the active layout target.
   *
   * @param targetCount - Desired number of samples for current grid layout.
   * @returns Promise that resolves when reconciliation completes.
   */
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
