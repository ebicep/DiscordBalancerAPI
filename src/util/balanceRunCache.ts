import type {
	ExperimentalBalanceResponseJson,
	RegularBalanceResponseJson,
} from './balanceDisplay.js';

export type BalanceRunKind = 'experimental' | 'regular';

export type BalanceRunCacheEntry = {
	kind: BalanceRunKind;
	userId: string;
	players: string[];
	lastResponse: ExperimentalBalanceResponseJson | RegularBalanceResponseJson;
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
	lastResponse: ExperimentalBalanceResponseJson | RegularBalanceResponseJson,
	kind: BalanceRunKind,
): void {
	pruneExpired();
	byMessageId.set(messageId, {
		entry: { kind, userId, players, lastResponse },
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
