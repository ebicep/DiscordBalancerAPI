import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import {
	type AllPlayerStatsBody,
	formatWeeklyAllStatsTable,
} from '../util/experimentalAllStats.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalWeeklyAll = {
	data: new SlashCommandBuilder()
		.setName('weekly-experimental-all')
		.setDescription(
			"This week's W/L/K/D for all players; optional week id for a completed historical week",
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Week id from time_week; omit for current week')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const weekId = interaction.options.getInteger('id');
		const path =
			weekId === null
				? '/experimental/weekly-all'
				: `/experimental/weekly-all?id=${weekId}`;
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
		const table = formatWeeklyAllStatsTable(body, weekId ?? undefined);
		await interaction.editReply({
			content: plainCodeBlockWithinDiscordContentLimit(table),
		});
	},
};
