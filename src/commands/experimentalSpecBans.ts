import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import {
	EXPERIMENTAL_CLASSES_ORDERED,
	EXPERIMENTAL_SPECS_ORDERED,
	EXPERIMENTAL_SPEC_TYPES_ORDERED,
	formatSpecBansReply,
} from '../util/experimentalSpecs.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';

export const experimentalSpecBans = {
	data: new SlashCommandBuilder()
		.setName('spec-bans-experimental')
		.setDescription('Experimental spec bans (GET/POST /experimental/spec-bans)')
		.addSubcommand((sub) =>
			sub
				.setName('get')
				.setDescription('List banned specs for a player')
				.addStringOption((o) =>
					o.setName('name').setDescription('Player name or UUID').setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('ban')
				.setDescription('Ban a spec, class, or spec type for a player')
				.addStringOption((o) => {
					const opt = o
						.setName('spec')
						.setDescription('Spec to ban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_SPECS_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) => {
					const opt = o
						.setName('class')
						.setDescription('Class to ban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_CLASSES_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) => {
					const opt = o
						.setName('spectype')
						.setDescription('Spec type to ban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_SPEC_TYPES_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) =>
					o.setName('name').setDescription('Player name or UUID').setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('unban')
				.setDescription('Unban a spec, class, or spec type for a player')
				.addStringOption((o) => {
					const opt = o
						.setName('spec')
						.setDescription('Spec to unban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_SPECS_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) => {
					const opt = o
						.setName('class')
						.setDescription('Class to unban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_CLASSES_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) => {
					const opt = o
						.setName('spectype')
						.setDescription('Spec type to unban')
						.setRequired(false);
					for (const s of EXPERIMENTAL_SPEC_TYPES_ORDERED) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				})
				.addStringOption((o) =>
					o.setName('name').setDescription('Player name or UUID').setRequired(false),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		const effectiveName = resolveOptionalPlayerName(interaction);

		if (sub === 'get') {
			let res: Response;
			try {
				const out = await balancerFetch(
					`/experimental/spec-bans/${encodeURIComponent(effectiveName)}`,
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

			const body = parseJsonBody(rawBody) as { bans?: string[] };
			await interaction.editReply({
				content: plainCodeBlockWithinDiscordContentLimit(formatSpecBansReply(body)),
			});
			return;
		}

		const spec = interaction.options.getString('spec');
		const className = interaction.options.getString('class');
		const specType = interaction.options.getString('spectype');
		const selectedCount = [spec, className, specType].filter((v) => v != null).length;
		if (selectedCount !== 1) {
			await interaction.editReply({
				content: 'Provide exactly one of spec, class, or specType.',
			});
			return;
		}

		const requestBody =
			spec != null
				? { spec }
				: className != null
					? { class: className }
					: { specType };

		const path =
			sub === 'ban'
				? `/experimental/spec-bans/ban/${encodeURIComponent(effectiveName)}`
				: `/experimental/spec-bans/unban/${encodeURIComponent(effectiveName)}`;

		let res: Response;
		try {
			const out = await balancerFetch(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			});
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

		const body = parseJsonBody(rawBody) as { bans?: string[] };
		await interaction.editReply({
			content: plainCodeBlockWithinDiscordContentLimit(formatSpecBansReply(body)),
		});
	},
};
