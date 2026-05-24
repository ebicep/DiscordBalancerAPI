import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { plainCodeBlockWithinDiscordContentLimit } from '../util/discordText.js';
import {
	EXPERIMENTAL_SPECS_ORDERED,
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
				.setDescription('Ban a spec for a player')
				.addStringOption((o) => {
					const opt = o
						.setName('spec')
						.setDescription('Spec to ban')
						.setRequired(true);
					for (const s of EXPERIMENTAL_SPECS_ORDERED) {
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
				.setDescription('Unban a spec for a player')
				.addStringOption((o) => {
					const opt = o
						.setName('spec')
						.setDescription('Spec to unban')
						.setRequired(true);
					for (const s of EXPERIMENTAL_SPECS_ORDERED) {
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

		const spec = interaction.options.getString('spec', true);
		const path =
			sub === 'ban'
				? `/experimental/spec-bans/ban/${encodeURIComponent(effectiveName)}`
				: `/experimental/spec-bans/unban/${encodeURIComponent(effectiveName)}`;

		let res: Response;
		try {
			const out = await balancerFetch(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spec }),
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
