import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import {balancerFetch} from '../api/balancerApi.js';
import {formatFailedApiResponse} from '../util/apiErrorMessage.js';

const MAX_REPLY_LENGTH = 1900;

function truncate(content: string): string {
	if (content.length <= MAX_REPLY_LENGTH) {
		return content;
	}
	return `${content.slice(0, MAX_REPLY_LENGTH)}…\n_(truncated)_`;
}

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
	return {season, ts};
}

function responseJsonBlock(body: unknown): string {
	return truncate(['```json', JSON.stringify(body, null, 2), '```'].join('\n'));
}

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
			const res = await balancerFetch('/time/season', {method: 'GET'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			const body = (await res.json()) as LatestSeasonBody;
			const parsed = seasonBodyFields(body);
			if (parsed === null) {
				await interaction.editReply(responseJsonBlock(body));
				return;
			}
			await interaction.editReply(
				`**Season:** ${parsed.season}\n**Timestamp:** ${parsed.ts}`,
			);
			return;
		}
		if (sub === 'new-day') {
			const res = await balancerFetch('/time/new-day', {method: 'POST'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			const body: unknown = await res.json();
			await interaction.editReply(responseJsonBlock(body));
			return;
		}
		if (sub === 'new-week') {
			const res = await balancerFetch('/time/new-week', {method: 'POST'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			const body: unknown = await res.json();
			await interaction.editReply(responseJsonBlock(body));
			return;
		}
		if (sub === 'new-season') {
			const res = await balancerFetch('/time/new-season', {method: 'POST'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			const body: unknown = await res.json();
			await interaction.editReply(responseJsonBlock(body));
			return;
		}
		if (sub === 'undo-day') {
			const dayId = interaction.options.getInteger('day_id', true);
			const res = await balancerFetch(`/time/day/${dayId}`, {method: 'DELETE'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			await interaction.editReply('Day undone.');
			return;
		}
		if (sub === 'undo-week') {
			const weekId = interaction.options.getInteger('week_id', true);
			const res = await balancerFetch(`/time/week/${weekId}`, {method: 'DELETE'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			await interaction.editReply('Week undone.');
			return;
		}
		if (sub === 'undo-season') {
			const seasonId = interaction.options.getInteger('season_id', true);
			const res = await balancerFetch(`/time/season/${seasonId}`, {method: 'DELETE'});
			if (!res.ok) {
				await interaction.editReply(await formatFailedApiResponse(res));
				return;
			}
			await interaction.editReply('Season undone.');
			return;
		}
	},
};
