export const EXPERIMENTAL_SPECS_ORDERED: readonly string[] = [
	'Pyromancer',
	'Cryomancer',
	'Aquamancer',
	'Berserker',
	'Defender',
	'Revenant',
	'Avenger',
	'Crusader',
	'Protector',
	'Thunderlord',
	'Spiritguard',
	'Earthwarden',
	'Assassin',
	'Vindicator',
	'Apothecary',
	'Conjurer',
	'Sentinel',
	'Luminary',
] as const;

export function formatSpecWeightsReply(body: Record<string, unknown>): string {
	return EXPERIMENTAL_SPECS_ORDERED.map((spec) => {
		const v = body[spec] ?? body[spec.toLowerCase()];
		return `${spec}: ${typeof v === 'number' ? v : 0}`;
	}).join('\n');
}

export type DailySpecStatsEntry = {
	spec?: string;
	Spec?: string;
	wins?: number;
	Wins?: number;
	losses?: number;
	Losses?: number;
	kills?: number;
	Kills?: number;
	deaths?: number;
	Deaths?: number;
};

export type DailyAllSpecsBody = {
	specs?: DailySpecStatsEntry[];
	Specs?: DailySpecStatsEntry[];
	total?: DailySpecStatsEntry;
	Total?: DailySpecStatsEntry;
};

function readDailySpecEntry(entry: DailySpecStatsEntry) {
	return {
		spec: entry.spec ?? entry.Spec ?? '',
		wins: entry.wins ?? entry.Wins ?? 0,
		losses: entry.losses ?? entry.Losses ?? 0,
		kills: entry.kills ?? entry.Kills ?? 0,
		deaths: entry.deaths ?? entry.Deaths ?? 0,
	};
}

function formatAllSpecsTable(
	body: DailyAllSpecsBody,
	period?: { periodLabel: 'Day' | 'Week'; periodId: number },
): string {
	const specs = (body.specs ?? body.Specs ?? []).map(readDailySpecEntry);
	const totalEntry = body.total ?? body.Total;
	const rows = totalEntry ? [...specs, readDailySpecEntry(totalEntry)] : specs;

	const specWidth = Math.max('Spec'.length, ...rows.map((r) => r.spec.length));
	const numWidth = Math.max(
		'Wins'.length,
		'Losses'.length,
		'Kills'.length,
		'Deaths'.length,
		...rows.flatMap((r) => [
			String(r.wins).length,
			String(r.losses).length,
			String(r.kills).length,
			String(r.deaths).length,
		]),
	);

	const formatRow = (cells: [string, string, string, string, string]) =>
		[
			cells[0].padEnd(specWidth),
			cells[1].padStart(numWidth),
			cells[2].padStart(numWidth),
			cells[3].padStart(numWidth),
			cells[4].padStart(numWidth),
		].join(' | ');

	const header = formatRow(['Spec', 'Wins', 'Losses', 'Kills', 'Deaths']);
	const rule = formatRow([
		'-'.repeat(specWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
	]);

	const specLines = specs.map((r) =>
		formatRow([
			r.spec,
			String(r.wins),
			String(r.losses),
			String(r.kills),
			String(r.deaths),
		]),
	);

	const output: string[] = [header, rule, ...specLines];
	if (totalEntry) {
		const total = readDailySpecEntry(totalEntry);
		output.push(
			rule,
			formatRow([
				total.spec,
				String(total.wins),
				String(total.losses),
				String(total.kills),
				String(total.deaths),
			]),
		);
	}

	const table = output.join('\n');
	if (period !== undefined) {
		return [`${period.periodLabel} ${period.periodId}`, rule, table].join('\n');
	}
	return table;
}

export function formatDailySpecsTable(body: DailyAllSpecsBody, dayId?: number): string {
	return formatAllSpecsTable(
		body,
		dayId !== undefined ? { periodLabel: 'Day', periodId: dayId } : undefined,
	);
}

export function formatWeeklySpecsTable(body: DailyAllSpecsBody, weekId?: number): string {
	return formatAllSpecsTable(
		body,
		weekId !== undefined ? { periodLabel: 'Week', periodId: weekId } : undefined,
	);
}
