import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import {
	type AllPlayerStatsBody,
	formatDailyAllStatsTable,
} from '../util/experimentalAllStats.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalDailyAll = {
	data: new SlashCommandBuilder()
		.setName('daily-experimental-all')
		.setDescription(
			"Today's W/L/K/D for all players; optional day id for a completed historical day",
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Day id from time_day; omit for current day')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const dayId = interaction.options.getInteger('id');
		const path =
			dayId === null ? '/experimental/daily-all' : `/experimental/daily-all?id=${dayId}`;
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
		const table = formatDailyAllStatsTable(body, dayId ?? undefined);
		await interaction.editReply({
			content: plainCodeBlockWithinDiscordContentLimit(table),
		});
	},
};
