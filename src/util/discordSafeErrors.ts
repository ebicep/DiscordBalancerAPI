/** User-visible strings only — no API payloads, stack traces, URLs, or hostnames. */

export const GENERIC_COMMAND_FAILURE =
	'Something went wrong. Please try again later.';

export function httpFailureLine(status: number): string {
	return `Request failed (HTTP ${status}).`;
}
