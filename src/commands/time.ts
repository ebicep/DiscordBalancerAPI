import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { truncateDiscordReply } from '../util/discordText.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';

type LatestSeasonBody = {
	season?: number;
	timestamp?: string;
	Season?: number;
	Timestamp?: string;
};

function seasonBodyFields(body: LatestSeasonBody): { season: number; ts: string } | null {
	const season = body.season ?? body.Season;
	const ts = body.timestamp ?? body.Timestamp;
	if (typeof season !== 'number' || typeof ts !== 'string') {
		return null;
	}
	return { season, ts };
}

function responseJsonBlock(body: unknown): string {
	return truncateDiscordReply(['```json', JSON.stringify(body, null, 2), '```'].join('\n'));
}

const fileOpts = (files: ReturnType<typeof balancerApiJsonAttachments>) =>
	files.length > 0 ? { files } : {};

export const time = {
	data: new SlashCommandBuilder()
		.setName('time')
		.setDescription('Balancer time progression (seasons, weeks, days)')
		.addSubcommand((sub) =>
			sub.setName('season').setDescription('Get the current season (TimeRead)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('new-day')
				.setDescription('Advance to a new day (TimeWrite)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('new-week')
				.setDescription('Advance to a new week (TimeWrite)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('new-season')
				.setDescription('Start a new season (TimeWrite)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('undo-day')
				.setDescription('Undo a day by ID (TimeWrite)')
				.addIntegerOption((o) =>
					o
						.setName('day_id')
						.setDescription('Day ID to remove')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('undo-week')
				.setDescription('Undo a week by ID (TimeWrite)')
				.addIntegerOption((o) =>
					o
						.setName('week_id')
						.setDescription('Week ID to remove')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('undo-season')
				.setDescription('Undo a season by ID (TimeWrite)')
				.addIntegerOption((o) =>
					o
						.setName('season_id')
						.setDescription('Season ID to remove')
						.setRequired(true),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub === 'season') {
			const { response: res, requestBody } = await balancerFetch('/time/season', {
				method: 'GET',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const body = parseJsonBody(rawBody) as LatestSeasonBody;
			const parsed = seasonBodyFields(body);
			if (parsed === null) {
				await interaction.editReply({
					content: responseJsonBlock(body),
					...fileOpts(files),
				});
				return;
			}
			await interaction.editReply({
				content: `**Season:** ${parsed.season}\n**Timestamp:** ${parsed.ts}`,
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'new-day') {
			const { response: res, requestBody } = await balancerFetch('/time/new-day', {
				method: 'POST',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const body = parseJsonBody(rawBody);
			await interaction.editReply({
				content: responseJsonBlock(body),
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'new-week') {
			const { response: res, requestBody } = await balancerFetch('/time/new-week', {
				method: 'POST',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const body = parseJsonBody(rawBody);
			await interaction.editReply({
				content: responseJsonBlock(body),
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'new-season') {
			const { response: res, requestBody } = await balancerFetch('/time/new-season', {
				method: 'POST',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const body = parseJsonBody(rawBody);
			await interaction.editReply({
				content: responseJsonBlock(body),
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'undo-day') {
			const dayId = interaction.options.getInteger('day_id', true);
			const { response: res, requestBody } = await balancerFetch(`/time/day/${dayId}`, {
				method: 'DELETE',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			await interaction.editReply({
				content: 'Day undone.',
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'undo-week') {
			const weekId = interaction.options.getInteger('week_id', true);
			const { response: res, requestBody } = await balancerFetch(`/time/week/${weekId}`, {
				method: 'DELETE',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			await interaction.editReply({
				content: 'Week undone.',
				...fileOpts(files),
			});
			return;
		}
		if (sub === 'undo-season') {
			const seasonId = interaction.options.getInteger('season_id', true);
			const { response: res, requestBody } = await balancerFetch(
				`/time/season/${seasonId}`,
				{
					method: 'DELETE',
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			await interaction.editReply({
				content: 'Season undone.',
				...fileOpts(files),
			});
			return;
		}
	},
};
