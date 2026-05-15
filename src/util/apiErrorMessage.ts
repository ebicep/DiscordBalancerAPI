import { httpFailureLine } from './discordSafeErrors.js';
import { truncatePlainToMax } from './discordText.js';

/** Walks `Error` / `Error.cause` chain and returns the first `NodeJS.ErrnoException.code`, if any. */
export function extractErrnoCode(err: unknown): string | undefined {
	let chain: unknown = err;
	while (chain instanceof Error) {
		const code = (chain as NodeJS.ErrnoException).code;
		if (typeof code === 'string' && code.length > 0) {
			return code;
		}
		const next = (chain as Error & { cause?: unknown }).cause;
		if (next === undefined) {
			break;
		}
		chain = next;
	}
	return undefined;
}

function pickProblemJsonMessage(parsed: Record<string, unknown>): string | null {
	const title =
		typeof parsed.title === 'string' ? parsed.title.trim() : '';
	const detail =
		typeof parsed.detail === 'string' ? parsed.detail.trim() : '';
	const message =
		typeof parsed.message === 'string' ? parsed.message.trim() : '';
	if (detail.length > 0) {
		return detail;
	}
	if (title.length > 0) {
		return title;
	}
	if (message.length > 0) {
		return message;
	}
	const errors = parsed.errors;
	if (errors !== undefined && typeof errors === 'object' && errors !== null) {
		const lines: string[] = [];
		for (const [key, val] of Object.entries(errors)) {
			if (Array.isArray(val)) {
				const bits = val.filter((x): x is string => typeof x === 'string');
				if (bits.length > 0) {
					lines.push(`${key}: ${bits.join('; ')}`);
				}
			}
		}
		if (lines.length > 0) {
			return lines.join('\n');
		}
	}
	return null;
}

/** ProblemDetails-style `detail` / `title` / validation `errors`, or `null` if none. */
export function extractProblemDetailFromParsedJson(parsed: unknown): string | null {
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const msg = pickProblemJsonMessage(parsed as Record<string, unknown>);
	return msg === null ? null : truncatePlainToMax(msg);
}

/** User-visible text from a non-OK response body (already read). */
export function formatFailedApiBody(status: number, raw: string): string {
	const trimmed = raw.trim();
	if (trimmed === '') {
		return httpFailureLine(status);
	}
	try {
		const parsed: unknown = JSON.parse(trimmed);
		if (parsed !== null && typeof parsed === 'object') {
			const msg = pickProblemJsonMessage(parsed as Record<string, unknown>);
			if (msg !== null) {
				return truncatePlainToMax(msg);
			}
			return truncatePlainToMax(JSON.stringify(parsed, null, 2));
		}
	} catch {
		// not JSON
	}
	return truncatePlainToMax(trimmed);
}

/** User-visible text from a non-OK `fetch` response (reads and consumes the body). */
export async function formatFailedApiResponse(res: Response): Promise<string> {
	let raw: string;
	try {
		raw = await res.text();
	} catch {
		return httpFailureLine(res.status);
	}
	return formatFailedApiBody(res.status, raw);
}
