import { createApiClient, getApiBaseUrl } from '@shared/lib/api';
import { assert, isMat, isVec } from '@shared/lib/types';
import { buildError, fail, type Result } from '@shared/lib/result';

export type ComplexEigenvalue = {
  real: number;
  imag: number;
  magnitude: number;
};

export type MarkovAnalyzeRequest = {
  transitionMatrix: number[][];
  initialVector: number[];
  currentVector: number[];
};

export type MarkovAnalysisResponse = {
  isRowStochastic: boolean;
  rowSums: number[];
  nextVector: number[];
  stationaryDistribution: number[];
  stationaryResidual: number;
  spectralGap: number | null;
  eigenvalues: ComplexEigenvalue[];
};

const client = createApiClient();

/**
 * Resolve the API base URL for display in the Markov demo.
 */
export { getApiBaseUrl };

/**
 * Request backend Markov-chain analysis for the active matrix/vector state.
 */
export function analyzeMarkov(request: MarkovAnalyzeRequest): Promise<Result<MarkovAnalysisResponse>> {
  if (!isMat(request.transitionMatrix)) {
    return Promise.resolve(fail(buildError('transitionMatrix must be number[][]', 0)));
  }
  if (!isVec(request.initialVector)) {
    return Promise.resolve(fail(buildError('initialVector must be number[]', 0)));
  }
  if (!isVec(request.currentVector)) {
    return Promise.resolve(fail(buildError('currentVector must be number[]', 0)));
  }

  return client.requestJson<MarkovAnalysisResponse>(
    '/api/v1/markov/analyze',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
    validateMarkovAnalysisResponse
  );
}

function validateMarkovAnalysisResponse(data: unknown): MarkovAnalysisResponse {
  assert(isObject(data), 'markov/analyze response must be an object');

  assert(typeof data.isRowStochastic === 'boolean', 'markov/analyze: isRowStochastic must be boolean');
  assert(isVec(data.rowSums), 'markov/analyze: rowSums must be number[]');
  assert(isVec(data.nextVector), 'markov/analyze: nextVector must be number[]');
  assert(
    isVec(data.stationaryDistribution),
    'markov/analyze: stationaryDistribution must be number[]'
  );
  assert(
    typeof data.stationaryResidual === 'number' && Number.isFinite(data.stationaryResidual),
    'markov/analyze: stationaryResidual must be a finite number'
  );
  assert(
    data.spectralGap === null || (typeof data.spectralGap === 'number' && Number.isFinite(data.spectralGap)),
    'markov/analyze: spectralGap must be null or finite number'
  );
  assert(Array.isArray(data.eigenvalues), 'markov/analyze: eigenvalues must be an array');

  data.eigenvalues.forEach((value, index) => {
    assert(isObject(value), `markov/analyze: eigenvalues[${index}] must be an object`);
    assert(
      typeof value.real === 'number' && Number.isFinite(value.real),
      `markov/analyze: eigenvalues[${index}].real must be finite`
    );
    assert(
      typeof value.imag === 'number' && Number.isFinite(value.imag),
      `markov/analyze: eigenvalues[${index}].imag must be finite`
    );
    assert(
      typeof value.magnitude === 'number' && Number.isFinite(value.magnitude),
      `markov/analyze: eigenvalues[${index}].magnitude must be finite`
    );
  });

  return data as MarkovAnalysisResponse;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object';
}
