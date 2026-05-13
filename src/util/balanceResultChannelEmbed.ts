import { Client, EmbedBuilder, type Message } from 'discord.js';

const MAX_BATCHES = 3;
const BATCH_SIZE = 100;

export type ParsedResultFooter =
	| { season: number; tbd: true }
	| { season: number; wins0: number; wins1: number };

/** Parses footer text from embed2. Uses segment before `|` for legacy footers that included extras. */
export function parseResultFooter(
	footerText: string | null | undefined,
): ParsedResultFooter | null {
	if (footerText === undefined || footerText === null) {
		return null;
	}
	const head = footerText.trim().split('|')[0]?.trim() ?? '';
	const m = /^Result \(S(\d+)\):\s*(TBD|(\d+)\s*-\s*(\d+))\s*$/i.exec(head);
	if (m === null) {
		return null;
	}
	const season = Number(m[1]);
	if (m[2].toUpperCase() === 'TBD') {
		return { season, tbd: true as const };
	}
	return {
		season,
		wins0: Number(m[3]),
		wins1: Number(m[4]),
	};
}

export function formatResultFooter(
	season: number,
	wins0: number,
	wins1: number,
): string {
	if (wins0 === 0 && wins1 === 0) {
		return `Result (S${season}): TBD`;
	}
	return `Result (S${season}): ${wins0}-${wins1}`;
}

function normalizeName(s: string): string {
	return s.trim().toLowerCase();
}

function namesFromInputSide(raw: unknown): Set<string> | null {
	if (!Array.isArray(raw) || raw.length === 0) {
		return null;
	}
	const out = new Set<string>();
	for (const el of raw) {
		if (el === null || typeof el !== 'object') {
			return null;
		}
		const nameVal = (el as Record<string, unknown>).name;
		if (typeof nameVal !== 'string') {
			return null;
		}
		const n = normalizeName(nameVal);
		if (n.length === 0) {
			return null;
		}
		out.add(n);
	}
	return out;
}

function parseWinnerLoserNameSets(
	inputBody: unknown,
): { winners: Set<string>; losers: Set<string> } | null {
	if (inputBody === null || typeof inputBody !== 'object') {
		return null;
	}
	const winnersRaw = (inputBody as Record<string, unknown>).winners;
	const losersRaw = (inputBody as Record<string, unknown>).losers;
	const winners = namesFromInputSide(winnersRaw);
	const losers = namesFromInputSide(losersRaw);
	if (winners === null || losers === null) {
		return null;
	}
	return { winners, losers };
}

function codeBlockInnerText(value: string): string | null {
	const v = value.trim();
	if (!v.startsWith('```')) {
		return null;
	}
	const end = v.lastIndexOf('```');
	if (end <= 2) {
		return null;
	}
	return v
		.slice(3, end)
		.replace(/^\w*\r?\n?/, '')
		.trim();
}

function rosterFromEmbedFieldValue(value: string): Set<string> | null {
	const inner = codeBlockInnerText(value);
	if (inner === null) {
		return null;
	}
	const out = new Set<string>();
	const lines = inner.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}
		const dash = line.indexOf(' - ');
		if (dash <= 0) {
			return null;
		}
		const name = normalizeName(line.slice(0, dash));
		if (name.length === 0) {
			return null;
		}
		out.add(name);
	}
	return out.size > 0 ? out : null;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) {
		return false;
	}
	for (const x of a) {
		if (!b.has(x)) {
			return false;
		}
	}
	return true;
}

function winnerIndexForEmbedByRosters(
	embed: { fields?: readonly { name: string; value: string }[] | null },
	winners: Set<string>,
	losers: Set<string>,
): 0 | 1 | null {
	const rosterFields: Set<string>[] = [];
	for (const f of embed.fields ?? []) {
		// Team fields have a descriptive name and a code-block roster value.
		if (!f.name.includes('Team')) {
			continue;
		}
		const roster = rosterFromEmbedFieldValue(f.value);
		if (roster !== null) {
			rosterFields.push(roster);
		}
	}
	if (rosterFields.length < 2) {
		return null;
	}
	const team0 = rosterFields[0]!;
	const team1 = rosterFields[1]!;
	if (setsEqual(team0, winners) && setsEqual(team1, losers)) {
		return 0;
	}
	if (setsEqual(team0, losers) && setsEqual(team1, winners)) {
		return 1;
	}
	return null;
}

/** Walk channel history newest-first until an embed matches winners/losers rosters. */
export async function findLatestResultMessage(
	client: Client,
	channelId: string,
	winners: Set<string>,
	losers: Set<string>,
): Promise<{
	message: Message;
	embedIndex: number;
	winnerIdx: 0 | 1;
	footerText: string | null;
} | null> {
	const ch = await client.channels.fetch(channelId);
	if (ch === null || !ch.isTextBased() || ch.isDMBased()) {
		return null;
	}
	let before: string | undefined;
	for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
		const messages = await ch.messages.fetch({ limit: BATCH_SIZE, before });
		if (messages.size === 0) {
			return null;
		}
		for (const msg of messages.values()) {
			for (let embedIndex = 0; embedIndex < msg.embeds.length; embedIndex += 1) {
				const em = msg.embeds[embedIndex];
				if (em === undefined) {
					continue;
				}
				const idx = winnerIndexForEmbedByRosters(em, winners, losers);
				if (idx !== null) {
					return {
						message: msg,
						embedIndex,
						winnerIdx: idx,
						footerText: em.footer?.text ?? null,
					};
				}
			}
		}
		const oldest = messages.last();
		if (oldest === undefined) {
			return null;
		}
		before = oldest.id;
		if (messages.size < BATCH_SIZE) {
			return null;
		}
	}
	return null;
}

async function editResultEmbedFooter(
	message: Message,
	embedIndex: number,
	newFooter: string,
): Promise<void> {
	const newEmbeds = message.embeds.map((e, i) =>
		i === embedIndex
			? EmbedBuilder.from(e).setFooter({ text: newFooter })
			: EmbedBuilder.from(e),
	);
	await message.edit({ embeds: newEmbeds });
}

/** After successful POST …/input: bump series score on the result-channel embed. */
export async function applyResultEmbedAfterInput(
	client: Client,
	channelId: string,
	balanceId: string,
	inputBody: unknown,
): Promise<void> {
	const parsedInput = parseWinnerLoserNameSets(inputBody);
	if (parsedInput === null) {
		console.error(
			'balance result embed: could not parse winners/losers names from input body for',
			balanceId,
		);
		return;
	}
	const found = await findLatestResultMessage(
		client,
		channelId,
		parsedInput.winners,
		parsedInput.losers,
	);
	if (found === null) {
		console.error(
			'balance result embed: no roster-matching message found in channel for',
			balanceId,
		);
		return;
	}
	const parsedFooter = parseResultFooter(found.footerText);
	if (parsedFooter === null) {
		console.error('balance result embed: could not parse matched embed footer', {
			balanceId,
			footerText: found.footerText,
			winnerIdx: found.winnerIdx,
		});
		return;
	}
	let wins0 = 0;
	let wins1 = 0;
	if ('tbd' in parsedFooter && parsedFooter.tbd) {
		wins0 = found.winnerIdx === 0 ? 1 : 0;
		wins1 = found.winnerIdx === 1 ? 1 : 0;
	} else if ('wins0' in parsedFooter) {
		wins0 = parsedFooter.wins0;
		wins1 = parsedFooter.wins1;
		if (found.winnerIdx === 0) {
			wins0 += 1;
		} else {
			wins1 += 1;
		}
	}
	const next = formatResultFooter(parsedFooter.season, wins0, wins1);
	await editResultEmbedFooter(
		found.message,
		found.embedIndex,
		next,
	);
}
