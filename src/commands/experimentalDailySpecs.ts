import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import {
	type DailyAllSpecsBody,
	formatDailySpecsTable,
} from '../util/experimentalSpecs.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalDailySpecs = {
	data: new SlashCommandBuilder()
		.setName('daily-experimental-specs')
		.setDescription(
			"Today's per-spec W/L/K/D for a player; optional day id for a completed historical day",
		)
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name').setRequired(false),
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Day id from time_day; omit for current day')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);
		const dayId = interaction.options.getInteger('id');
		const path =
			dayId === null
				? `/experimental/daily-experimental-specs/${encodeURIComponent(effectiveName)}`
				: `/experimental/daily-experimental-specs/${encodeURIComponent(effectiveName)}?id=${dayId}`;
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

		const body = parseJsonBody(rawBody) as DailyAllSpecsBody;
		const table = formatDailySpecsTable(body, dayId ?? undefined);
		await interaction.editReply({
			content: plainCodeBlockWithinDiscordContentLimit(table),
		});
	},
};
