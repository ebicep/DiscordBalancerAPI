import { getEnv } from '../config/env.js';

export type ApiFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

/**
 * Fetch relative to /api/v{version}; sends Bearer API key.
 * Uses env from `initializeEnv()`.
 */
export async function balancerFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const env = getEnv();
  const url = `${env.balancerApiBaseUrl}/api/v${env.apiVersion}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.balancerApiKey}`,
    Accept: 'application/json',
    ...(init.headers ?? {}),
  };
  return fetch(url, { ...init, headers });
}
