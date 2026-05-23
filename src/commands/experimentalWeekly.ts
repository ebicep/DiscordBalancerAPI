import { type AttachmentBuilder, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { balancerApiJsonAttachments, parseJsonBody } from '../util/jsonDiscordAttachment.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

type ExperimentalWeeklyStatsBody = {
	wins?: number;
	losses?: number;
	kills?: number;
	deaths?: number;
	Wins?: number;
	Losses?: number;
	Kills?: number;
	Deaths?: number;
};

function formatWeeklyStatsReply(body: ExperimentalWeeklyStatsBody, weekId?: number): string {
	const wins = body.wins ?? body.Wins ?? 0;
	const losses = body.losses ?? body.Losses ?? 0;
	const kills = body.kills ?? body.Kills ?? 0;
	const deaths = body.deaths ?? body.Deaths ?? 0;
	const lines = [`Wins: ${wins}`, `Losses: ${losses}`, `Kills: ${kills}`, `Deaths: ${deaths}`];
	if (weekId !== undefined) {
		lines.unshift(`Week ${weekId}`);
	}
	return lines.join('\n');
}

export const experimentalWeekly = {
	data: new SlashCommandBuilder()
		.setName('weekly-experimental')
		.setDescription(
			"This week's W/L/K/D for a player; optional week id for a completed historical week",
		)
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name').setRequired(false),
		)
		.addIntegerOption((o) =>
			o
				.setName('id')
				.setDescription('Week id from time_week; omit for current week')
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);
		const weekId = interaction.options.getInteger('id');
		const path =
			weekId === null
				? `/experimental/weekly/${encodeURIComponent(effectiveName)}`
				: `/experimental/weekly/${encodeURIComponent(effectiveName)}?id=${weekId}`;
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

		const body = parseJsonBody(rawBody) as ExperimentalWeeklyStatsBody;
		await interaction.editReply({
			content: formatWeeklyStatsReply(body, weekId ?? undefined),
			// ...fileOpts(files),
		});
	},
};
