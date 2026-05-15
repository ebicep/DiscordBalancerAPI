import { plainCodeBlockWithinDiscordContentLimit } from './discordText.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function formatOldTrajectory(old: number | null): string {
	return old === null ? '0' : String(old);
}

function formatNewTrajectory(n: number | null): string {
	return n === null ? '?' : String(n);
}

function parseFiniteInt(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) {
		return v;
	}
	return null;
}

function parseNullableTrajectory(v: unknown): number | null | undefined {
	if (v === null || v === undefined) {
		return null;
	}
	if (typeof v === 'number' && Number.isFinite(v)) {
		return v;
	}
	return undefined;
}

type ChangeRow = {
	name: string;
	oldTrajectory: number | null;
	newTrajectory: number | null;
	oldWins: number;
	newWins: number;
	oldLosses: number;
	newLosses: number;
	oldKills: number;
	newKills: number;
	oldDeaths: number;
	newDeaths: number;
};

/**
 * Discord message `content`: fenced code block summarizing `changes`
 * from the API response only, or `null` if the shape is invalid.
 */
export function formatInputTrajectoryDiscordContent(
	responseParsed: unknown,
): string | null {
	if (!isPlainObject(responseParsed)) {
		return null;
	}
	if (!Object.prototype.hasOwnProperty.call(responseParsed, 'changes')) {
		return null;
	}
	const rawChanges = responseParsed.changes;
	if (rawChanges === null || rawChanges === undefined) {
		return plainCodeBlockWithinDiscordContentLimit('(no changes)');
	}
	if (!Array.isArray(rawChanges)) {
		return null;
	}

	const rows: ChangeRow[] = [];

	for (const el of rawChanges) {
		if (!isPlainObject(el)) {
			return null;
		}

		const name = typeof el.name === 'string' ? el.name.trim() : '';

		const oldTrajectory = parseNullableTrajectory(el.old_trajectory);
		if (oldTrajectory === undefined) {
			return null;
		}

		const newTrajectory = parseNullableTrajectory(el.new_trajectory);
		if (newTrajectory === undefined) {
			return null;
		}

		const oldWins = parseFiniteInt(el.old_wins);
		const newWins = parseFiniteInt(el.new_wins);
		const oldLosses = parseFiniteInt(el.old_losses);
		const newLosses = parseFiniteInt(el.new_losses);
		const oldKills = parseFiniteInt(el.old_kills);
		const newKills = parseFiniteInt(el.new_kills);
		const oldDeaths = parseFiniteInt(el.old_deaths);
		const newDeaths = parseFiniteInt(el.new_deaths);
		if (
			oldWins === null ||
			newWins === null ||
			oldLosses === null ||
			newLosses === null ||
			oldKills === null ||
			newKills === null ||
			oldDeaths === null ||
			newDeaths === null
		) {
			return null;
		}

		rows.push({
			name,
			oldTrajectory,
			newTrajectory,
			oldWins,
			newWins,
			oldLosses,
			newLosses,
			oldKills,
			newKills,
			oldDeaths,
			newDeaths,
		});
	}

	rows.sort((a, b) => {
		const bn = b.newTrajectory ?? Number.NEGATIVE_INFINITY;
		const an = a.newTrajectory ?? Number.NEGATIVE_INFINITY;
		const byNew = bn - an;
		if (byNew !== 0) {
			return byNew;
		}
		return a.name.localeCompare(b.name);
	});

	const lines = rows.map(
		(r) =>
			`${r.name}: ${formatOldTrajectory(r.oldTrajectory)} > ${formatNewTrajectory(r.newTrajectory)} ` +
			`(${r.oldWins}:${r.oldLosses} > ${r.newWins}:${r.newLosses}) ` +
			`(${r.oldKills}:${r.oldDeaths} > ${r.newKills}:${r.newDeaths})`,
	);

	const inner = lines.length === 0 ? '(no changes)' : lines.join('\n');

	return plainCodeBlockWithinDiscordContentLimit(inner);
}
