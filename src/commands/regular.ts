import {
	type ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
	ThreadChannel,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import {
	extractProblemDetailFromParsedJson,
	formatFailedApiBody,
} from '../util/apiErrorMessage.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import {
	regularBalanceEmbeds,
	parseRegularBalanceResponse,
} from '../util/balanceDisplay.js';
import {
	isPublicThreadParentChannel,
	runInReplyThread,
	sendBalancerFilesToThread,
} from '../util/replyThread.js';
import { parsePlayersString } from './experimental.js';

const fileOpts = (files: import('discord.js').AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

async function dispatchRunFailure(
	interaction: ChatInputCommandInteraction,
	params: { errorContent: string; files: import('discord.js').AttachmentBuilder[] },
): Promise<void> {
	const { errorContent, files } = params;
	const fallbackPayload = { content: errorContent, ...fileOpts(files) };
	const ch = interaction.channel;

	if (ch instanceof ThreadChannel) {
		await interaction.editReply({ content: errorContent });
		await sendBalancerFilesToThread(ch, files);
		return;
	}

	if (isPublicThreadParentChannel(ch)) {
		await interaction.editReply({ content: errorContent });
		if (files.length === 0) return;
		const starterMsg = await interaction.fetchReply();
		await runInReplyThread({
			interaction,
			starterMessage: starterMsg,
			threadTitle: 'Error',
			threadTitleWhenEmpty: 'Error',
			logLabel: 'regular run (error): failed to create or post in thread',
			onNoThreadParent: async () => { await interaction.editReply(fallbackPayload); },
			onThreadOpenError: async () => { await interaction.editReply(fallbackPayload); },
			inThread: async (thread) => { await sendBalancerFilesToThread(thread, files); },
		});
		return;
	}

	await interaction.editReply(fallbackPayload);
}

export const regular = {
	data: new SlashCommandBuilder()
		.setName('regular')
		.setDescription('Regular balance (run without spec assignment)')
		.addSubcommand((sub) =>
			sub
				.setName('run')
				.setDescription('Compute balance for players (POST /regular/balance)')
				.addStringOption((o) =>
					o
						.setName('players')
						.setDescription('Comma- or space-separated names or UUIDs')
						.setRequired(true),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();

		if (sub === 'run') {
			const playersRaw = interaction.options.getString('players', true);
			const players = parsePlayersString(playersRaw);
			if (players.length === 0) {
				await interaction.editReply({ content: 'Provide at least one player name or UUID.' });
				return;
			}
			const body = JSON.stringify({ players });

			let res: Response;
			let requestBody: string | undefined;
			try {
				const out = await balancerFetch('/regular/balance', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body,
				});
				res = out.response;
				requestBody = out.requestBody;
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Could not reach Balancer API.';
				const synthetic = JSON.stringify({ error: message }, null, 2);
				await dispatchRunFailure(interaction, {
					errorContent: message,
					files: balancerApiJsonAttachments(body, synthetic),
				});
				return;
			}

			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await dispatchRunFailure(interaction, {
					errorContent: formatFailedApiBody(res.status, rawBody),
					files,
				});
				return;
			}

			const parsedUnknown = parseJsonBody(rawBody);
			const parsed = parseRegularBalanceResponse(parsedUnknown);
			if (parsed === null) {
				await dispatchRunFailure(interaction, {
					errorContent: 'Balance API returned an unexpected JSON shape.',
					files,
				});
				return;
			}

			const embeds = regularBalanceEmbeds(parsed);
			const firstEmbed = embeds[0];
			if (firstEmbed === undefined) {
				await dispatchRunFailure(interaction, {
					errorContent: 'Could not build balance embed.',
					files,
				});
				return;
			}

			await interaction.editReply({ content: `\`\`\`\n${playersRaw}\n\`\`\`` });
			const starterMsg = await interaction.fetchReply();

			const postInChannel = async (target: import('discord.js').GuildTextBasedChannel | ThreadChannel) => {
				return target.send({ embeds, ...fileOpts(files) });
			};

			const ch = interaction.channel;
			if (ch instanceof ThreadChannel) {
				await postInChannel(ch);
				return;
			}

			await runInReplyThread({
				interaction,
				starterMessage: starterMsg,
				threadTitle: parsed.balance_id,
				threadTitleWhenEmpty: parsed.balance_id,
				logLabel: 'regular run: failed to create or post in thread',
				onNoThreadParent: async () => {
					await interaction.followUp({
						content: 'Use `/regular run` in a text or announcement channel so a thread can be created.',
						flags: MessageFlags.Ephemeral,
					});
				},
				onThreadOpenError: async () => {
					await interaction.followUp({
						content: 'Could not create a thread or post inside it. Check **Create Public Threads** and **Send Messages in Threads** for the bot.',
						flags: MessageFlags.Ephemeral,
					});
				},
				inThread: async (thread) => {
					await postInChannel(thread);
				},
			});
		}
	},
};
