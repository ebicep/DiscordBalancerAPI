import { type AttachmentBuilder, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { balancerApiJsonAttachments, parseJsonBody } from '../util/jsonDiscordAttachment.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

type ExperimentalSeasonStatsBody = {
	wins?: number;
	losses?: number;
	kills?: number;
	deaths?: number;
	Wins?: number;
	Losses?: number;
	Kills?: number;
	Deaths?: number;
};

function formatSeasonStatsReply(body: ExperimentalSeasonStatsBody, seasonId?: number): string {
	const wins = body.wins ?? body.Wins ?? 0;
	const losses = body.losses ?? body.Losses ?? 0;
	const kills = body.kills ?? body.Kills ?? 0;
	const deaths = body.deaths ?? body.Deaths ?? 0;
	const lines = [`Wins: ${wins}`, `Losses: ${losses}`, `Kills: ${kills}`, `Deaths: ${deaths}`];
	if (seasonId !== undefined) {
		lines.unshift(`Season ${seasonId}`);
	}
	return lines.join('\n');
}

export const experimentalSeason = {
	data: new SlashCommandBuilder()
		.setName('season-experimental')
		.setDescription(
			"This season's W/L/K/D for a player; optional season id for a completed historical season",
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
				? `/experimental/season/${encodeURIComponent(effectiveName)}`
				: `/experimental/season/${encodeURIComponent(effectiveName)}?id=${seasonId}`;
		let res: Response;
		let requestBody: string | undefined;
		try {
			const out = await balancerFetch(path, { method: 'GET' });
			res = out.response;
			requestBody = out.requestBody;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Could not reach Balancer API.';
			await interaction.editReply({ content: message });
			return;
		}

		const rawBody = await res.text();
		const files = balancerApiJsonAttachments(requestBody, rawBody);
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
				// ...fileOpts(files),
			});
			return;
		}

		const body = parseJsonBody(rawBody) as ExperimentalSeasonStatsBody;
		await interaction.editReply({
			content: formatSeasonStatsReply(body, seasonId ?? undefined),
			// ...fileOpts(files),
		});
	},
};
