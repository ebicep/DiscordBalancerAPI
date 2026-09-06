import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';
import {
	averageWeightLeaderboardEmbed,
	type AverageWeightLeaderboardEntryJson,
} from '../util/leaderboardEmbed.js';

const LEADERBOARD_PAGE_SIZE = 25;

export const averageLeaderboard = {
	data: new SlashCommandBuilder()
		.setName('leaderboard-average')
		.setDescription(
			'Top average spec weights (GET /experimental/spec-weights/average-leaderboard)',
		)
		.addIntegerOption((o) =>
			o
				.setName('page')
				.setDescription('Page number (default 1)')
				.setRequired(false)
				.setMinValue(1),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const page = interaction.options.getInteger('page') ?? 1;
		let res: Response;
		try {
			const out = await balancerFetch(
				`/experimental/spec-weights/average-leaderboard?page=${page}&pageSize=${LEADERBOARD_PAGE_SIZE}`,
				{ method: 'GET' },
			);
			res = out.response;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Could not reach Balancer API.';
			await interaction.editReply({ content: message });
			return;
		}

		const rawBody = await res.text();
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
			});
			return;
		}

		const body = parseJsonBody(rawBody) as AverageWeightLeaderboardEntryJson[];
		const embed = averageWeightLeaderboardEmbed(page, body);
		await interaction.editReply({ embeds: [embed] });
	},
};
