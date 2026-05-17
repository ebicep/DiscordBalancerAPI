import { type AttachmentBuilder, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import { formatSpecWeightsReply } from '../util/experimentalSpecs.js';
import { balancerApiJsonAttachments, parseJsonBody } from '../util/jsonDiscordAttachment.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

export const experimentalSpecWeights = {
	data: new SlashCommandBuilder()
		.setName('spec-weights-experimental')
		.setDescription('Combined spec weights for a player (GET /experimental/spec-weights)')
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name or UUID').setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);
		let res: Response;
		let requestBody: string | undefined;
		try {
			const out = await balancerFetch(
				`/experimental/spec-weights/${encodeURIComponent(effectiveName)}`,
				{ method: 'GET' },
			);
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
				...fileOpts(files),
			});
			return;
		}

		const body = parseJsonBody(rawBody) as Record<string, unknown>;
		await interaction.editReply({
			content: plainCodeBlockWithinDiscordContentLimit(formatSpecWeightsReply(body)),
		});
	},
};
