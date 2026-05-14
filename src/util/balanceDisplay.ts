import { EmbedBuilder } from 'discord.js';

import { markdownPlainCodeBlock } from './discordText.js';
import { BALANCER_EMBED_BLUE, BALANCER_EMBED_WARNING } from './embedColors.js';

const SPEC_SORT_ORDER: readonly string[] = [
	'Conjurer',
	'Pyromancer',
	'Berserker',
	'Assassin',
	'Thunderlord',
	'Avenger',
	'Defender',
	'Sentinel',
	'Cryomancer',
	'Vindicator',
	'Crusader',
	'Spiritguard',
	'Aquamancer',
	'Luminary',
	'Revenant',
	'Protector',
	'Earthwarden',
	'Apothecary',
] as const;

type TeamStyle = {
	/** Shown in field titles, e.g. "Blue" → "**__Blue Team__** …" */
	displayName: string;
	/** Used for `EmbedBuilder.setColor` when this team is first in the list. */
	embedColor: number;
};

const TEAM_STYLES: readonly TeamStyle[] = [
	{ displayName: 'Blue', embedColor: 0x3498db },
	{ displayName: 'Red', embedColor: 0xe74c3c },
	{ displayName: 'Green', embedColor: 0x2ecc71 },
	{ displayName: 'Yellow', embedColor: 0xf1c40f },
	{ displayName: 'Orange', embedColor: 0xe67e22 },
	{ displayName: 'Purple', embedColor: 0x9b59b6 },
	{ displayName: 'Teal', embedColor: 0x1abc9c },
	{ displayName: 'Pink', embedColor: 0xfd79a8 },
	{ displayName: 'Lime', embedColor: 0xa3cb38 },
	{ displayName: 'Indigo', embedColor: 0x5b6ee1 },
	{ displayName: 'Gold', embedColor: 0xf39c12 },
	{ displayName: 'Cyan', embedColor: 0x00cec9 },
] as const;

function styleForTeamIndex(index: number): TeamStyle {
	const named = TEAM_STYLES[index];
	if (named !== undefined) {
		return named;
	}
	const mod = index % TEAM_STYLES.length;
	const cycled = TEAM_STYLES[mod];
	return {
		displayName: `Team ${index + 1}`,
		embedColor: cycled.embedColor,
	};
}

export type ExperimentalBalancePlayerSpecJson = {
	uuid: string;
	name: string;
	spec: string;
	weight: number;
	talker: number;
	win_loss: number;
	net_kd_per_game: number;
	off: boolean;
};

export type ExperimentalBalanceTeamJson = {
	total_weight: number;
	total_talkers: number;
	total_win_loss: number;
	total_net_kd_per_game: number;
	specs: ExperimentalBalancePlayerSpecJson[];
};

export type ExperimentalBalanceMetaStepJson = {
	name: string;
	durationMs: number;
	startOffsetMs: number;
};

export type ExperimentalBalanceMetaJson = {
	iterations: number;
	durationMs: number;
	steps: ExperimentalBalanceMetaStepJson[];
	season: number;
	time: string;
};

export type ExperimentalBalanceResponseJson = {
	balance_id: string;
	balance: ExperimentalBalanceTeamJson[];
	meta: ExperimentalBalanceMetaJson;
	total_off: number;
};

function specSortKey(spec: string): number {
	const i = SPEC_SORT_ORDER.indexOf(spec);
	return i === -1 ? 999 : i;
}

function formatBalanceEmbedTitle(meta: ExperimentalBalanceMetaJson): string {
	const d = new Date(meta.time);
	const when = !Number.isNaN(d.getTime()) ? d : new Date();
	return `${String(when)}*`;
}

function formatPlayerLineDetailed(p: ExperimentalBalancePlayerSpecJson): string {
	const tail = p.off ? ' !!!' : '';
	return `${p.name} - ${p.spec}(${p.weight}:${p.win_loss})${tail}`;
}

function formatPlayerLineShort(p: ExperimentalBalancePlayerSpecJson): string {
	const tail = p.off ? ' !!!' : '';
	return `${p.name} - ${p.spec}${tail}`;
}

function teamOffCount(team: ExperimentalBalanceTeamJson): number {
	return team.specs.filter((s) => s.off).length;
}

function teamHeader(
	teamDisplayName: string,
	team: ExperimentalBalanceTeamJson,
	teamOff: number,
): string {
	const kd = Number.isFinite(team.total_net_kd_per_game)
		? team.total_net_kd_per_game.toFixed(2)
		: String(team.total_net_kd_per_game);
	return `**__${teamDisplayName} Team__** - ${team.total_weight}  |  ${team.total_talkers}  |  ${team.total_win_loss}  |  ${kd}  |  ${teamOff}`;
}

function balanceIdCodeBlockField(balanceId: string): {
	name: string;
	value: string;
	inline: boolean;
} {
	return {
		name: '',
		value: markdownPlainCodeBlock(balanceId),
		inline: false,
	};
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
	const inner = v.slice(3, end).replace(/^\w*\r?\n?/, '').trimEnd();
	return inner.trim();
}

export function resultEmbedMatchesBalanceId(
	embed: {
		description?: string | null;
		fields?: readonly { name: string; value: string }[] | null;
	},
	balanceId: string,
): boolean {
	const want = balanceId.toLowerCase();
	for (const f of embed.fields ?? []) {
		const raw = f.value ?? '';
		const fromCode = codeBlockInnerText(raw);
		if (fromCode !== null && fromCode.toLowerCase() === want) {
			return true;
		}
	}
	return false;
}

function formatBalancePrimaryFooter(meta: ExperimentalBalanceMetaJson): string {
	const stepSumMs = meta.steps.reduce((a, s) => a + s.durationMs, 0);
	const balanceS = (stepSumMs > 0 ? stepSumMs : meta.durationMs) / 1000;
	const totalS = meta.durationMs / 1000;
	return `Iterations: ${meta.iterations} | balance: ${balanceS.toFixed(2)}s | total: ${totalS.toFixed(2)}s`;
}

export function experimentalRepeatSpecWarningEmbed(
	data: ExperimentalBalanceResponseJson,
): EmbedBuilder | null {
	const n = Math.trunc(data.total_off);
	if (n <= 0) {
		return null;
	}
	return new EmbedBuilder()
		.setTitle(`Warning: ${n} player(s) on repeat specs`)
		.setColor(BALANCER_EMBED_WARNING);
}

export function experimentalBalanceEmbeds(
	data: ExperimentalBalanceResponseJson,
	threadUrl?: string,
): EmbedBuilder[] {
	const teams = data.balance ?? [];

	const title = formatBalanceEmbedTitle(data.meta);
	const footerPrimary = formatBalancePrimaryFooter(data.meta);

	if (teams.length === 0) {
		const e = new EmbedBuilder()
			.setTitle(title)
			.setDescription(
				`balance_id: \`${data.balance_id}\`\n_No teams in response._`,
			)
			.setColor(BALANCER_EMBED_BLUE)
			.setFooter({ text: footerPrimary });
		return [e];
	}

	const chromeColor = styleForTeamIndex(0).embedColor;

	const detailFields = teams.map((team, index) => {
		const label = styleForTeamIndex(index).displayName;
		const sortedW = [...team.specs].sort((a, b) => b.weight - a.weight);
		const detail = sortedW.map(formatPlayerLineDetailed).join('\n');
		return {
			name: teamHeader(label, team, teamOffCount(team)),
			value: markdownPlainCodeBlock(detail),
			inline: false,
		};
	});

	const embed1 = new EmbedBuilder()
		.setTitle(title)
		.setColor(chromeColor)
		.addFields(detailFields)
		.setFooter({ text: footerPrimary })
		.setTimestamp();

	const specFields = teams.map((team, index) => {
		const label = styleForTeamIndex(index).displayName;
		const sortedSpec = [...team.specs].sort(
			(a, b) => specSortKey(a.spec) - specSortKey(b.spec),
		);
		const short = sortedSpec.map(formatPlayerLineShort).join('\n');
		return {
			name: teamHeader(label, team, teamOffCount(team)),
			value: markdownPlainCodeBlock(short),
			inline: true,
		};
	});
	specFields.push(balanceIdCodeBlockField(data.balance_id));
	if (typeof threadUrl === 'string' && threadUrl.length > 0) {
		specFields.push({
			name: '',
			value: `${threadUrl}`,
			inline: false,
		});
	}

	const seasonString = `(S${data.meta.season})`;
	const embed2 = new EmbedBuilder()
		.setTitle(title)
		.setColor(chromeColor)
		.addFields(specFields)
		.setFooter({ text: `Result ${seasonString}: TBD` })
		.setTimestamp();

	return [embed1, embed2];
}

export function parseExperimentalBalanceResponse(
	raw: unknown,
): ExperimentalBalanceResponseJson | null {
	if (raw === null || typeof raw !== 'object') {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const balanceId = o.balance_id;
	if (typeof balanceId !== 'string') {
		return null;
	}
	const balance = o.balance;
	const meta = o.meta;
	if (!Array.isArray(balance) || meta === null || typeof meta !== 'object') {
		return null;
	}
	const m = meta as Record<string, unknown>;
	if (
		typeof m.iterations !== 'number' ||
		typeof m.durationMs !== 'number' ||
		typeof m.season !== 'number' ||
		typeof m.time !== 'string' ||
		!Array.isArray(m.steps)
	) {
		return null;
	}

	const normalizedBalance: ExperimentalBalanceTeamJson[] = [];
	for (const item of balance) {
		if (item === null || typeof item !== 'object') {
			return null;
		}
		const t = item as Record<string, unknown>;
		if (!Array.isArray(t.specs)) {
			return null;
		}
		const specs: ExperimentalBalancePlayerSpecJson[] = [];
		for (const specEl of t.specs) {
			if (specEl === null || typeof specEl !== 'object') {
				return null;
			}
			const s = specEl as Record<string, unknown>;
			if (typeof s.off !== 'boolean') {
				return null;
			}
			specs.push({
				...(specEl as unknown as ExperimentalBalancePlayerSpecJson),
				off: s.off,
			});
		}
		normalizedBalance.push({
			...(t as unknown as ExperimentalBalanceTeamJson),
			specs,
		});
	}

	let totalOff: number;
	if (typeof o.total_off === 'number' && Number.isFinite(o.total_off)) {
		totalOff = Math.trunc(o.total_off);
	} else {
		totalOff = normalizedBalance.reduce((acc, team) => acc + teamOffCount(team), 0);
	}

	return {
		balance_id: balanceId,
		balance: normalizedBalance,
		meta: m as unknown as ExperimentalBalanceMetaJson,
		total_off: totalOff,
	};
}
