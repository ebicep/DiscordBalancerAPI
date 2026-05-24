import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { truncateDiscordReply } from '../util/discordText.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

type CurrentTimeBody = {
	day?: number;
	week?: number;
	season?: number;
	Day?: number;
	Week?: number;
	Season?: number;
};

function currentTimeBodyFields(
	body: CurrentTimeBody,
): { day: number; week: number; season: number } | null {
	const day = body.day ?? body.Day;
	const week = body.week ?? body.Week;
	const season = body.season ?? body.Season;
	if (
		typeof day !== 'number' ||
		typeof week !== 'number' ||
		typeof season !== 'number'
	) {
		return null;
	}
	return { day, week, season };
}

function responseJsonBlock(body: unknown): string {
	return truncateDiscordReply(['```json', JSON.stringify(body, null, 2), '```'].join('\n'));
}

export const timecurrent = {
	data: new SlashCommandBuilder()
		.setName('timecurrent')
		.setDescription('Current day, week, and season IDs (TimeRead)'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const { response: res } = await balancerFetch('/time', {
			method: 'GET',
		});
		const rawBody = await res.text();
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
			});
			return;
		}
		const body = parseJsonBody(rawBody) as CurrentTimeBody;
		const parsed = currentTimeBodyFields(body);
		if (parsed === null) {
			await interaction.editReply({
				content: responseJsonBlock(body),
			});
			return;
		}
		await interaction.editReply({
			content: `Day: ${parsed.day}\nWeek: ${parsed.week}\nSeason: ${parsed.season}`,
		});
	},
};
