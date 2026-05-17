import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { EXPERIMENTAL_SPECS_ORDERED } from '../util/experimentalSpecs.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';
import {
	specWeightLeaderboardEmbed,
	type SpecWeightLeaderboardResponseJson,
} from '../util/leaderboardEmbed.js';

const LEADERBOARD_PAGE_SIZE = 10;

export const experimentalLeaderboard = {
	data: new SlashCommandBuilder()
		.setName('leaderboard-experimental')
		.setDescription('Top spec weights per class (GET /experimental/spec-weights/leaderboard)')
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
				`/experimental/spec-weights/leaderboard?page=${page}&pageSize=${LEADERBOARD_PAGE_SIZE}`,
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

		const body = parseJsonBody(rawBody) as SpecWeightLeaderboardResponseJson;
		const embed = specWeightLeaderboardEmbed(page, EXPERIMENTAL_SPECS_ORDERED, body);
		await interaction.editReply({ embeds: [embed] });
	},
};
