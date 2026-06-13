export type PlayerStatsEntry = {
	name?: string;
	Name?: string;
	wins?: number;
	Wins?: number;
	losses?: number;
	Losses?: number;
	kills?: number;
	Kills?: number;
	deaths?: number;
	Deaths?: number;
};

export type AllPlayerStatsBody = {
	players?: PlayerStatsEntry[];
	Players?: PlayerStatsEntry[];
};

function readPlayerEntry(entry: PlayerStatsEntry) {
	return {
		name: entry.name ?? entry.Name ?? '',
		wins: entry.wins ?? entry.Wins ?? 0,
		losses: entry.losses ?? entry.Losses ?? 0,
		kills: entry.kills ?? entry.Kills ?? 0,
		deaths: entry.deaths ?? entry.Deaths ?? 0,
	};
}

function formatWl(wins: number, losses: number): string {
	const wl = wins - losses;
	if (wl > 0) {
		return `+${wl}`;
	}
	if (wl < 0) {
		return String(wl);
	}
	return '0';
}

function formatAllStatsTable(
	body: AllPlayerStatsBody,
	period?: { periodLabel: 'Day' | 'Week'; periodId: number },
): string {
	const players = (body.players ?? body.Players ?? [])
		.map(readPlayerEntry)
		.sort((a, b) => b.wins - b.losses - (a.wins - a.losses));

	const playerWidth = Math.max('Player'.length, ...players.map((p) => p.name.length));
	const wlValues = players.map((p) => formatWl(p.wins, p.losses));
	const wlWidth = Math.max('W-L'.length, ...wlValues.map((v) => v.length));
	const numWidth = Math.max(
		'Wins'.length,
		'Losses'.length,
		'Kills'.length,
		'Deaths'.length,
		...players.flatMap((p) => [
			String(p.wins).length,
			String(p.losses).length,
			String(p.kills).length,
			String(p.deaths).length,
		]),
	);

	const formatRow = (cells: [string, string, string, string, string, string]) =>
		[
			cells[0].padEnd(playerWidth),
			cells[1].padStart(wlWidth),
			cells[2].padStart(numWidth),
			cells[3].padStart(numWidth),
			cells[4].padStart(numWidth),
			cells[5].padStart(numWidth),
		].join(' | ');

	const header = formatRow(['Player', 'W-L', 'Wins', 'Losses', 'Kills', 'Deaths']);
	const rule = formatRow([
		'-'.repeat(playerWidth),
		'-'.repeat(wlWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
		'-'.repeat(numWidth),
	]);

	const playerLines = players.map((p) =>
		formatRow([
			p.name,
			formatWl(p.wins, p.losses),
			String(p.wins),
			String(p.losses),
			String(p.kills),
			String(p.deaths),
		]),
	);

	const table = [header, rule, ...playerLines].join('\n');
	if (period !== undefined) {
		return [`${period.periodLabel} ${period.periodId}`, table].join('\n');
	}
	return table;
}

export function formatDailyAllStatsTable(body: AllPlayerStatsBody, dayId?: number): string {
	return formatAllStatsTable(
		body,
		dayId !== undefined ? { periodLabel: 'Day', periodId: dayId } : undefined,
	);
}

export function formatWeeklyAllStatsTable(body: AllPlayerStatsBody, weekId?: number): string {
	return formatAllStatsTable(
		body,
		weekId !== undefined ? { periodLabel: 'Week', periodId: weekId } : undefined,
	);
}
