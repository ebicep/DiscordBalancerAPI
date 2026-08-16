import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { replyWithPlainCodeBlockChunks } from '../util/discordText.js';
import {
	type DailyAllSpecsBody,
	formatSeasonSpecsTable,
} from '../util/experimentalSpecs.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalSeasonSpecs = {
	data: new SlashCommandBuilder()
		.setName('season-experimental-specs')
		.setDescription(
			"This season's per-spec W/L/K/D for a player; optional season id for a completed historical season",
		)
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name').setRequired(false),
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Season id from time_season; omit for current season')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);
		const seasonId = interaction.options.getInteger('id');
		const path =
			seasonId === null
				? `/experimental/season-experimental-specs/${encodeURIComponent(effectiveName)}`
				: `/experimental/season-experimental-specs/${encodeURIComponent(effectiveName)}?id=${seasonId}`;
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
		const table = formatSeasonSpecsTable(body, seasonId ?? undefined);
		await replyWithPlainCodeBlockChunks(interaction, table);
	},
};
