import {
	type AttachmentBuilder,
	type ChatInputCommandInteraction,
	type GuildTextBasedChannel,
	MessageFlags,
	NewsChannel,
	SlashCommandBuilder,
	TextChannel,
	ThreadAutoArchiveDuration,
	ThreadChannel,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import {
	experimentalBalanceEmbeds,
	parseExperimentalBalanceResponse,
} from '../util/balanceDisplay.js';
import { rememberBalanceRun } from '../util/balanceRunCache.js';
import { buildBalanceButtonRow } from './balanceButtons.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

/** On failure: editReply with error + attachments. On success: editReply with JSON fence (+ optional prefix). Returns whether response was OK. */
async function replyWithBalancerJson(
	interaction: ChatInputCommandInteraction,
	res: Response,
	requestBody: string | undefined,
	options?: { successPrefix?: string },
): Promise<boolean> {
	const rawBody = await res.text();
	const files = balancerApiJsonAttachments(requestBody, rawBody);
	if (!res.ok) {
		await interaction.editReply({
			content: formatFailedApiBody(res.status, rawBody),
			...fileOpts(files),
		});
		return false;
	}
	const pretty = parseJsonBody(rawBody);
	const fence = `\`\`\`json\n${JSON.stringify(pretty, null, 2)}\n\`\`\``;
	const prefix = options?.successPrefix;
	const content =
		prefix !== undefined && prefix.length > 0 ? `${prefix}\n${fence}` : fence;
	await interaction.editReply({
		content,
		...fileOpts(files),
	});
	return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
	return UUID_RE.test(s.trim());
}

export function parsePlayersString(raw: string): string[] {
	const decoded = raw.split('%2C').join(',');
	return decoded
		.split(/[\s,]+/)
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
}

export const experimental = {
	data: new SlashCommandBuilder()
		.setName('experimental')
		.setDescription('Experimental balance API (run, confirm, input, …)')
		.addSubcommand((sub) =>
			sub
				.setName('run')
				.setDescription('Compute balance for players (POST /experimental/balance)')
				.addStringOption((o) =>
					o
						.setName('players')
						.setDescription('Comma- or space-separated names or UUIDs')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('confirm')
				.setDescription('Confirm a balance (POST …/confirm)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('unconfirm')
				.setDescription('Unconfirm a balance (POST …/unconfirm)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('input')
				.setDescription('Submit game input (POST …/input)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName('body')
						.setDescription('JSON body (winners, losers, game_id)')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('uninput')
				.setDescription('Undo input (POST …/uninput)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName('body')
						.setDescription('Optional JSON body (trajectory echo)')
						.setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('clear-input')
				.setDescription('Clear stored input (POST …/clear-input)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('generate-input')
				.setDescription('Mock input JSON for a balance (GET …/generate-input)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
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
				await interaction.editReply({
					content: 'Provide at least one player name or UUID.',
				});
				return;
			}
			const body = JSON.stringify({ players });
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
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const parsedUnknown = parseJsonBody(rawBody);
			const parsed = parseExperimentalBalanceResponse(parsedUnknown);
			if (parsed === null) {
				await interaction.editReply({
					content: 'Balance API returned an unexpected JSON shape.',
					...fileOpts(files),
				});
				return;
			}
			const embeds = experimentalBalanceEmbeds(parsed);
			const firstEmbed = embeds[0];
			if (firstEmbed === undefined) {
				await interaction.editReply({
					content: 'Could not build balance embed.',
					...fileOpts(files),
				});
				return;
			}

			await interaction.editReply({
				content: `\`\`\`\n${playersRaw}\n\`\`\``,
			});
			const starterMsg = await interaction.fetchReply();

			const postBalanceInChannel = async (target: GuildTextBasedChannel) => {
				return target.send({
					embeds: [firstEmbed],
					components: [buildBalanceButtonRow(parsed.balance_id)],
					...fileOpts(files),
				});
			};

			const ch = interaction.channel;
			if (ch instanceof ThreadChannel) {
				const threadMsg = await postBalanceInChannel(ch);
				rememberBalanceRun(
					threadMsg.id,
					interaction.user.id,
					players,
					parsed,
				);
				return;
			}

			if (!(ch instanceof TextChannel || ch instanceof NewsChannel)) {
				await interaction.followUp({
					content:
						'Use `/experimental run` in a text or announcement channel so a thread can be created.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			try {
				const thread = await starterMsg.startThread({
					name: parsed.balance_id,
					autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
				});
				const threadMsg = await postBalanceInChannel(thread);
				rememberBalanceRun(
					threadMsg.id,
					interaction.user.id,
					players,
					parsed,
				);
			} catch (err) {
				console.error(err);
				await interaction.followUp({
					content:
						'Could not create a thread or post inside it. Check **Create Public Threads** and **Send Messages in Threads** for the bot.',
					flags: MessageFlags.Ephemeral,
				});
			}
			return;
		}

		if (sub === 'confirm' || sub === 'unconfirm' || sub === 'clear-input') {
			const balanceId = interaction.options.getString('balance_id', true).trim();
			if (!isUuid(balanceId)) {
				await interaction.editReply({
					content: '`balance_id` must be a valid UUID.',
				});
				return;
			}
			const path =
				sub === 'confirm'
					? `/experimental/balance/${balanceId}/confirm`
					: sub === 'unconfirm'
						? `/experimental/balance/${balanceId}/unconfirm`
						: `/experimental/balance/${balanceId}/clear-input`;
			const { response: res, requestBody } = await balancerFetch(path, {
				method: 'POST',
			});
			const summary =
				sub === 'confirm'
					? 'Confirmed.'
					: sub === 'unconfirm'
						? 'Unconfirmed.'
						: 'Input cleared.';
			await replyWithBalancerJson(interaction, res, requestBody, {
				successPrefix: summary,
			});
			return;
		}

		if (sub === 'generate-input') {
			const balanceId = interaction.options.getString('balance_id', true).trim();
			if (!isUuid(balanceId)) {
				await interaction.editReply({
					content: '`balance_id` must be a valid UUID.',
				});
				return;
			}
			const { response: res, requestBody } = await balancerFetch(
				`/experimental/balance/${balanceId}/generate-input`,
				{ method: 'GET' },
			);
			await replyWithBalancerJson(interaction, res, requestBody);
			return;
		}

		if (sub === 'input') {
			const balanceId = interaction.options.getString('balance_id', true).trim();
			const bodyRaw = interaction.options.getString('body', true);
			if (!isUuid(balanceId)) {
				await interaction.editReply({
					content: '`balance_id` must be a valid UUID.',
				});
				return;
			}
			let parsedBody: unknown;
			try {
				parsedBody = JSON.parse(bodyRaw) as unknown;
			} catch {
				await interaction.editReply({
					content: '`body` must be valid JSON.',
				});
				return;
			}
			const serialized = JSON.stringify(parsedBody);
			const { response: res, requestBody } = await balancerFetch(
				`/experimental/balance/${balanceId}/input`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: serialized,
				},
			);
			await replyWithBalancerJson(interaction, res, requestBody);
			return;
		}

		if (sub === 'uninput') {
			const balanceId = interaction.options.getString('balance_id', true).trim();
			const bodyOpt = interaction.options.getString('body');
			if (!isUuid(balanceId)) {
				await interaction.editReply({
					content: '`balance_id` must be a valid UUID.',
				});
				return;
			}
			const trimmed = bodyOpt?.trim() ?? '';
			let init: Parameters<typeof balancerFetch>[1];
			if (trimmed === '') {
				init = { method: 'POST' };
			} else {
				let parsedBody: unknown;
				try {
					parsedBody = JSON.parse(trimmed) as unknown;
				} catch {
					await interaction.editReply({
						content: '`body` must be valid JSON when provided.',
					});
					return;
				}
				const serialized = JSON.stringify(parsedBody);
				init = {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: serialized,
				};
			}
			const { response: res, requestBody } = await balancerFetch(
				`/experimental/balance/${balanceId}/uninput`,
				init,
			);
			await replyWithBalancerJson(interaction, res, requestBody);
		}
	},
};
