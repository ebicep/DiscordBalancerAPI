import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { replyWithPlainCodeBlockChunks } from '../util/discordText.js';
import {
	type AllPlayerStatsBody,
	formatSeasonAllStatsTable,
} from '../util/experimentalAllStats.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalSeasonAll = {
	data: new SlashCommandBuilder()
		.setName('season-experimental-all')
		.setDescription(
			"This season's W/L/K/D for all players; optional season id for a completed historical season",
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Season id from time_season; omit for current season')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const seasonId = interaction.options.getInteger('id');
		const path =
			seasonId === null
				? '/experimental/season-all'
				: `/experimental/season-all?id=${seasonId}`;
		let res: Response;
		try {
			const out = await balancerFetch(path, { method: 'GET' });
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

		const body = parseJsonBody(rawBody) as AllPlayerStatsBody;
		const table = formatSeasonAllStatsTable(body, seasonId ?? undefined);
		await replyWithPlainCodeBlockChunks(interaction, table);
	},
};
