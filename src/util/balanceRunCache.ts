import type { ExperimentalBalanceResponseJson } from './balanceDisplay.js';

export type BalanceRunCacheEntry = {
	userId: string;
	players: string[];
	lastResponse: ExperimentalBalanceResponseJson;
};

const TTL_MS = 15 * 60 * 1000;

type Stored = { entry: BalanceRunCacheEntry; expiresAt: number };

const byMessageId = new Map<string, Stored>();

function pruneExpired(): void {
	const now = Date.now();
	for (const [id, row] of byMessageId) {
		if (now > row.expiresAt) {
			byMessageId.delete(id);
		}
	}
}

export function rememberBalanceRun(
	messageId: string,
	userId: string,
	players: string[],
	lastResponse: ExperimentalBalanceResponseJson,
): void {
	pruneExpired();
	byMessageId.set(messageId, {
		entry: { userId, players, lastResponse },
		expiresAt: Date.now() + TTL_MS,
	});
}

export function getBalanceRun(
	messageId: string,
): BalanceRunCacheEntry | undefined {
	pruneExpired();
	const row = byMessageId.get(messageId);
	if (row === undefined || Date.now() > row.expiresAt) {
		byMessageId.delete(messageId);
		return undefined;
	}
	return row.entry;
}
