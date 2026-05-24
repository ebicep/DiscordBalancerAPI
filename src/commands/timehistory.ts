import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { truncateDiscordReply } from '../util/discordText.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

type TimePeriodEntryBody = {
	id?: number;
	timestamp?: string;
	Id?: number;
	Timestamp?: string;
};

type TimeHistoryBody = {
	days?: TimePeriodEntryBody[];
	weeks?: TimePeriodEntryBody[];
	seasons?: TimePeriodEntryBody[];
	Days?: TimePeriodEntryBody[];
	Weeks?: TimePeriodEntryBody[];
	Seasons?: TimePeriodEntryBody[];
};

type ParsedEntry = { id: number; timestamp: string };

function parsePeriodEntry(entry: TimePeriodEntryBody): ParsedEntry | null {
	const id = entry.id ?? entry.Id;
	const timestamp = entry.timestamp ?? entry.Timestamp;
	if (typeof id !== 'number' || typeof timestamp !== 'string') {
		return null;
	}
	return { id, timestamp };
}

function parsePeriodList(
	entries: TimePeriodEntryBody[] | undefined,
): ParsedEntry[] | null {
	if (entries === undefined) {
		return null;
	}
	const parsed: ParsedEntry[] = [];
	for (const entry of entries) {
		const row = parsePeriodEntry(entry);
		if (row === null) {
			return null;
		}
		parsed.push(row);
	}
	return parsed;
}

function timeHistoryBodyFields(
	body: TimeHistoryBody,
): { days: ParsedEntry[]; weeks: ParsedEntry[]; seasons: ParsedEntry[] } | null {
	const days = parsePeriodList(body.days ?? body.Days);
	const weeks = parsePeriodList(body.weeks ?? body.Weeks);
	const seasons = parsePeriodList(body.seasons ?? body.Seasons);
	if (days === null || weeks === null || seasons === null) {
		return null;
	}
	return { days, weeks, seasons };
}

function discordTimestamp(iso: string): string {
	const sec = Math.floor(new Date(iso).getTime() / 1000);
	if (!Number.isFinite(sec)) {
		return iso;
	}
	return `<t:${sec}:F>`;
}

function formatSection(title: string, entries: ParsedEntry[]): string {
	if (entries.length === 0) {
		return `${title}\n  (none)`;
	}
	const lines = entries.map((e) => `- ${e.id}) ${discordTimestamp(e.timestamp)}`);
	return `${title}\n${lines.join('\n')}`;
}

function responseJsonBlock(body: unknown): string {
	return truncateDiscordReply(['```json', JSON.stringify(body, null, 2), '```'].join('\n'));
}

export const timehistory = {
	data: new SlashCommandBuilder()
		.setName('timehistory')
		.setDescription('Recent day, week, and season boundaries (TimeRead)'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const { response: res } = await balancerFetch('/time/history', {
			method: 'GET',
		});
		const rawBody = await res.text();
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
			});
			return;
		}
		const body = parseJsonBody(rawBody) as TimeHistoryBody;
		const parsed = timeHistoryBodyFields(body);
		if (parsed === null) {
			await interaction.editReply({
				content: responseJsonBlock(body),
			});
			return;
		}
		const content = truncateDiscordReply(
			[
				formatSection('## Day', parsed.days),
				formatSection('## Week', parsed.weeks),
				formatSection('## Season', parsed.seasons),
			].join('\n'),
		);
		await interaction.editReply({ content });
	},
};
