import {
	EmbedBuilder,
	type ButtonInteraction,
	MessageFlags,
	type MessageEditOptions,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import {
	experimentalBalanceEmbeds,
	experimentalRepeatSpecWarningEmbed,
	parseExperimentalBalanceResponse,
} from '../util/balanceDisplay.js';
import { hasCoordinatorRole } from '../util/coordinatorPlayer.js';
import { markdownPlainCodeBlock } from '../util/discordText.js';
import { getBalanceRun, rememberBalanceRun } from '../util/balanceRunCache.js';
import { moveBalanceTeamsToVoice } from '../util/voiceTeamMove.js';
import { BALANCE_POST_RESULT_CHANNEL_ID } from './balanceConstants.js';
import {
	EXPBAL_CANCEL,
	EXPBAL_CONFIRM_PREFIX,
	EXPBAL_REBAL,
	balanceActorDisplayName,
	buildBalanceButtonRow,
	buildCancelledBalanceRow,
	buildPostedBalanceRow,
	buildRebalConsumedRow,
} from './balanceButtons.js';

const fileOpts = (files: ReturnType<typeof balancerApiJsonAttachments>) =>
	files.length > 0 ? { files } : {};

async function editBalanceButtons(
	interaction: ButtonInteraction,
	components: MessageEditOptions['components'],
): Promise<void> {
	await interaction.message.edit({ components });
}

export async function handleBalanceButton(
	interaction: ButtonInteraction,
): Promise<void> {
	const cached = getBalanceRun(interaction.message.id);
	if (cached === undefined) {
		await interaction.reply({
			content: 'This balance message expired or is no longer valid.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!hasCoordinatorRole(interaction)) {
		return;
	}

	const id = interaction.customId;

	if (id === EXPBAL_CANCEL) {
		await interaction.deferUpdate();
		await editBalanceButtons(interaction, [
			buildCancelledBalanceRow(balanceActorDisplayName(interaction)),
		]);
		return;
	}

	if (id === EXPBAL_REBAL) {
		await interaction.deferUpdate();
		await editBalanceButtons(interaction, [
			buildRebalConsumedRow(balanceActorDisplayName(interaction)),
		]);
		const body = JSON.stringify({ players: cached.players });
		const { response: res, requestBody } = await balancerFetch(
			'/experimental/balance',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
			},
		);
		const rawBody = await res.text();
		const files = balancerApiJsonAttachments(requestBody, rawBody);
		if (!res.ok) {
			await editBalanceButtons(interaction, [
				buildBalanceButtonRow(cached.lastResponse.balance_id),
			]);
			await interaction.followUp({
				content: formatFailedApiBody(res.status, rawBody),
				flags: MessageFlags.Ephemeral,
				...fileOpts(files),
			});
			return;
		}
		const parsedUnknown = parseJsonBody(rawBody);
		const parsed = parseExperimentalBalanceResponse(parsedUnknown);
		if (parsed === null) {
			await editBalanceButtons(interaction, [
				buildBalanceButtonRow(cached.lastResponse.balance_id),
			]);
			await interaction.followUp({
				content: 'Balance API returned an unexpected JSON shape.',
				flags: MessageFlags.Ephemeral,
				...fileOpts(files),
			});
			return;
		}
		const embeds = experimentalBalanceEmbeds(parsed);
		const warnEmbed = experimentalRepeatSpecWarningEmbed(parsed);
		const first = embeds[0];
		if (first === undefined) {
			await editBalanceButtons(interaction, [
				buildBalanceButtonRow(cached.lastResponse.balance_id),
			]);
			await interaction.followUp({
				content: 'Could not build balance embed.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		const sendTarget = interaction.channel;
		if (
			sendTarget === null ||
			!sendTarget.isTextBased() ||
			sendTarget.isDMBased()
		) {
			await editBalanceButtons(interaction, [
				buildBalanceButtonRow(cached.lastResponse.balance_id),
			]);
			await interaction.followUp({
				content: 'Cannot post rebalance in this channel.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		let newMsg;
		try {
			const balanceEmbeds = warnEmbed !== null ? [first, warnEmbed] : [first];
			newMsg = await sendTarget.send({
				embeds: balanceEmbeds,
				components: [buildBalanceButtonRow(parsed.balance_id)],
				...fileOpts(files),
			});
		} catch (err) {
			console.error('balance rebal send failed', err);
			await editBalanceButtons(interaction, [
				buildBalanceButtonRow(cached.lastResponse.balance_id),
			]);
			await interaction.followUp({
				content: 'Failed to post the new balance message.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		rememberBalanceRun(newMsg.id, cached.userId, cached.players, parsed);
		return;
	}

	if (id.startsWith(EXPBAL_CONFIRM_PREFIX)) {
		const balanceId = id.slice(EXPBAL_CONFIRM_PREFIX.length);
		if (balanceId === 'done' || balanceId === 'idle') {
			await interaction.reply({
				content: 'This action is no longer available.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await interaction.deferUpdate();
		const { response: res, requestBody } = await balancerFetch(
			`/experimental/balance/${balanceId}/confirm`,
			{ method: 'POST' },
		);
		const rawBody = await res.text();
		const files = balancerApiJsonAttachments(requestBody, rawBody);
		if (!res.ok) {
			await interaction.followUp({
				content: formatFailedApiBody(res.status, rawBody),
				flags: MessageFlags.Ephemeral,
				...fileOpts(files),
			});
			return;
		}
		await editBalanceButtons(interaction, [
			buildPostedBalanceRow(balanceActorDisplayName(interaction)),
		]);
		const parsedConfirm = parseJsonBody(rawBody);
		let postedBalanceId = balanceId;
		if (parsedConfirm !== null && typeof parsedConfirm === 'object') {
			const id = (parsedConfirm as Record<string, unknown>).balance_id;
			if (typeof id === 'string' && id.trim().length > 0) {
				postedBalanceId = id.trim();
			}
		}
		const channel = interaction.channel;
		if (
			channel !== null &&
			channel.isTextBased() &&
			!channel.isDMBased()
		) {
			await channel.send({
				content: markdownPlainCodeBlock(postedBalanceId),
			});
			if (files.length > 0) {
				await channel.send({
					...fileOpts(files),
				});
			}
		}

		const threadUrl =
			interaction.guildId !== null
				? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}`
				: undefined;
		const pair = experimentalBalanceEmbeds(cached.lastResponse, threadUrl);
		const second = pair[1];
		if (second !== undefined) {
			try {
				const target = await interaction.client.channels.fetch(
					BALANCE_POST_RESULT_CHANNEL_ID,
				);
				if (target !== null && target.isTextBased() && !target.isDMBased()) {
					const postedMessage = await target.send({ embeds: [second] });
					const originChannel = interaction.channel;
					if (
						originChannel !== null &&
						originChannel.isTextBased() &&
						!originChannel.isDMBased()
					) {
						try {
							await originChannel.send({
								embeds: [
									new EmbedBuilder().setDescription(postedMessage.url),
								],
							});
						} catch (linkErr) {
							console.error('balance post link message failed', linkErr);
						}
					}
				}
			} catch (e) {
				console.error('balance post-result channel send failed', e);
			}
		}

		const guild = interaction.guild;
		if (guild !== null) {
			void moveBalanceTeamsToVoice(guild, cached.lastResponse).catch((err) =>
				console.error('voice team move failed', err),
			);
		}
		return;
	}
}
