import { plainCodeBlockWithinDiscordContentLimit } from './discordText.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeUuidKey(raw: unknown): string | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const s = raw.trim().toLowerCase();
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			s,
		)
	) {
		return null;
	}
	return s;
}

function ingestPlayerLines(
	map: Map<string, string>,
	side: unknown,
): void {
	if (!Array.isArray(side)) {
		return;
	}
	for (const el of side) {
		if (!isPlainObject(el)) {
			continue;
		}
		const uuidKey = normalizeUuidKey(el.uuid);
		const nameVal = el.name;
		if (uuidKey === null || typeof nameVal !== 'string') {
			continue;
		}
		const name = nameVal.trim();
		if (name.length === 0) {
			continue;
		}
		map.set(uuidKey, name);
	}
}

function uuidToNameFromInputBody(requestBody: unknown): Map<string, string> {
	const map = new Map<string, string>();
	if (!isPlainObject(requestBody)) {
		return map;
	}
	ingestPlayerLines(map, requestBody.winners);
	ingestPlayerLines(map, requestBody.losers);
	return map;
}

function formatOld(oldVal: unknown): string | null {
	if (oldVal === null || oldVal === undefined) {
		return '0';
	}
	if (typeof oldVal === 'number' && Number.isFinite(oldVal)) {
		return String(oldVal);
	}
	return null;
}

function formatNew(newVal: unknown): string | null {
	if (typeof newVal === 'number' && Number.isFinite(newVal)) {
		return String(newVal);
	}
	return null;
}

/**
 * Discord message `content`: fenced code block summarizing adjustment_trajectories,
 * or `null` if the response shape cannot be summarized.
 */
export function formatInputTrajectoryDiscordContent(
	requestBody: unknown,
	responseParsed: unknown,
): string | null {
	if (!isPlainObject(responseParsed)) {
		return null;
	}
	if (!Object.prototype.hasOwnProperty.call(responseParsed, 'adjustment_trajectories')) {
		return null;
	}
	const rawTraj = responseParsed.adjustment_trajectories;
	let trajectories: Record<string, unknown>;
	if (rawTraj === null || rawTraj === undefined) {
		trajectories = {};
	} else if (!isPlainObject(rawTraj)) {
		return null;
	} else {
		trajectories = rawTraj;
	}

	const uuidToName = uuidToNameFromInputBody(requestBody);
	const uuidToTraj = new Map<
		string,
		{ old: number | null; new: number; rawKey: string }
	>();

	for (const [uuidRaw, pairRaw] of Object.entries(trajectories)) {
		const uuidCanon = normalizeUuidKey(uuidRaw);
		if (uuidCanon === null) {
			continue;
		}
		if (!isPlainObject(pairRaw)) {
			return null;
		}
		const newVal = pairRaw.new;
		if (typeof newVal !== 'number' || !Number.isFinite(newVal)) {
			return null;
		}
		const oldRaw = pairRaw.old;
		let oldNum: number | null;
		if (oldRaw === null || oldRaw === undefined) {
			oldNum = null;
		} else if (typeof oldRaw === 'number' && Number.isFinite(oldRaw)) {
			oldNum = oldRaw;
		} else {
			return null;
		}
		uuidToTraj.set(uuidCanon, {
			old: oldNum,
			new: newVal,
			rawKey: uuidRaw.trim(),
		});
	}

	const sorted = [...uuidToTraj.entries()].sort((a, b) => {
		const d = b[1].new - a[1].new;
		if (d !== 0) {
			return d;
		}
		return a[0].localeCompare(b[0]);
	});

	const lines: string[] = [];
	for (const [uuidCanon, traj] of sorted) {
		const oldStr = formatOld(traj.old);
		const newStr = formatNew(traj.new);
		const displayName = uuidToName.get(uuidCanon) ?? traj.rawKey;
		lines.push(`${displayName}: ${oldStr} > ${newStr}`);
	}

	let inner: string;
	if (lines.length === 0) {
		inner = '(no adjustment trajectories)';
	} else {
		inner = lines.join('\n');
	}

	return plainCodeBlockWithinDiscordContentLimit(inner);
}