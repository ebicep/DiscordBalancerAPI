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
): Promise<{ response: Response; requestBody?: string }> {
	const env = getEnv();
	const url = `${env.balancerApiBaseUrl}/api/v${env.apiVersion}${path.startsWith('/') ? path : `/${path}`}`;
	const mergedHeaders: Record<string, string> = {
		Authorization: `Bearer ${env.balancerApiKey}`,
		Accept: 'application/json',
		...(init.headers ?? {}),
	};
	const bodyStr = typeof init.body === 'string' ? init.body : undefined;
	try {
		const response = await fetch(url, { ...init, headers: mergedHeaders });
		return {
			response,
			...(bodyStr !== undefined ? { requestBody: bodyStr } : {}),
		};
	} catch (err) {
		console.error('balancerFetch failed', { url, err });
		let code: string | undefined;
		let chain: unknown = err;
		while (chain instanceof Error) {
			const c = (chain as NodeJS.ErrnoException).code;
			if (typeof c === 'string' && c.length > 0) {
				code = c;
				break;
			}
			const next = (chain as Error & { cause?: unknown }).cause;
			if (next === undefined) {
				break;
			}
			chain = next;
		}
		const suffix = code !== undefined ? ` (${code})` : '';
		throw new Error(`Could not reach Balancer API${suffix}.`, { cause: err });
	}
}
