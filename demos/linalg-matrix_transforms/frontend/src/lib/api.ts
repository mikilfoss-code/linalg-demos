import { createApi, getApiBaseUrl } from "@shared/lib/api";

const api = createApi();

/**
 * Resolve the API base URL for the demo client.
 */
export { getApiBaseUrl };

export const health = api.health!;
export const matrixApply = api.matrixApply!;
export const eigen = api.eigen!;
