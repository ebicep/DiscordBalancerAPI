import { type AttachmentBuilder, type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { EXPERIMENTAL_SPECS_ORDERED } from '../util/experimentalSpecs.js';
import { balancerApiJsonAttachments, parseJsonBody } from '../util/jsonDiscordAttachment.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

export const requestSpec = {
	data: new SlashCommandBuilder()
		.setName('request-spec')
		.setDescription('Request a spec for the next experimental balance')
		.addStringOption((o) => {
			const opt = o
				.setName('spec')
				.setDescription('Spec to request')
				.setRequired(true);
			for (const s of EXPERIMENTAL_SPECS_ORDERED) {
				opt.addChoices({ name: s, value: s });
			}
			return opt;
		})
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name or UUID').setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);
		const spec = interaction.options.getString('spec', true);

		const { response: res, requestBody } = await balancerFetch(
			`/experimental/request-spec/${encodeURIComponent(effectiveName)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spec }),
			},
		);

		const rawBody = await res.text();
		const files = balancerApiJsonAttachments(requestBody, rawBody);
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
				...fileOpts(files),
			});
			return;
		}

		const body = parseJsonBody(rawBody) as {
			spec?: string;
			game_cooldown?: number;
		};
		const specName = body.spec ?? spec;
		const cooldown = body.game_cooldown ?? 5;
		await interaction.editReply({
			content: `Spec request saved: **${specName}** (cooldown: ${cooldown} game(s) until priority applies).`,
			...fileOpts(files),
		});
	},
};
