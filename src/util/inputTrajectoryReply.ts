import { plainCodeBlockWithinDiscordContentLimit } from './discordText.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function formatOld(old: number | null): string {
	return old === null ? '0' : String(old);
}

function formatNew(n: number | null): string {
	return n === null ? '?' : String(n);
}

type TrajectoryRow = { name: string; old: number | null; new: number | null };

/**
 * Discord message `content`: fenced code block summarizing `adjustment_trajectories`
 * from the API response only, or `null` if the shape is invalid.
 */
export function formatInputTrajectoryDiscordContent(
	responseParsed: unknown,
): string | null {
	if (!isPlainObject(responseParsed)) {
		return null;
	}
	if (!Object.prototype.hasOwnProperty.call(responseParsed, 'adjustment_trajectories')) {
		return null;
	}
	const rawTraj = responseParsed.adjustment_trajectories;
	if (rawTraj === null || rawTraj === undefined) {
		return plainCodeBlockWithinDiscordContentLimit('(no adjustment trajectories)');
	}
	if (!Array.isArray(rawTraj)) {
		return null;
	}

	const rows: TrajectoryRow[] = [];

	for (const el of rawTraj) {
		if (!isPlainObject(el)) {
			return null;
		}

		const name = typeof el.name === 'string' ? el.name.trim() : '';

		const oldRaw = el.old;
		let oldNum: number | null;
		if (oldRaw === null || oldRaw === undefined) {
			oldNum = null;
		} else if (typeof oldRaw === 'number' && Number.isFinite(oldRaw)) {
			oldNum = oldRaw;
		} else {
			return null;
		}

		const newRaw = el.new;
		let newNum: number | null;
		if (newRaw === null || newRaw === undefined) {
			newNum = null;
		} else if (typeof newRaw === 'number' && Number.isFinite(newRaw)) {
			newNum = newRaw;
		} else {
			return null;
		}

		rows.push({ name, old: oldNum, new: newNum });
	}

	rows.sort((a, b) => {
		const bn = b.new ?? Number.NEGATIVE_INFINITY;
		const an = a.new ?? Number.NEGATIVE_INFINITY;
		const byNew = bn - an;
		if (byNew !== 0) {
			return byNew;
		}
		return a.name.localeCompare(b.name);
	});

	const lines = rows.map(
		(r) => `${r.name}: ${formatOld(r.old)} > ${formatNew(r.new)}`,
	);

	const inner =
		lines.length === 0
			? '(no adjustment trajectories)'
			: lines.join('\n');

	return plainCodeBlockWithinDiscordContentLimit(inner);
}
