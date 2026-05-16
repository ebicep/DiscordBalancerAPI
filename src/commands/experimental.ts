import {
	type AttachmentBuilder,
	type ChatInputCommandInteraction,
	GuildMember,
	type GuildTextBasedChannel,
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
	jsonDiscordAttachment,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import {
	experimentalBalanceEmbeds,
	experimentalRepeatSpecWarningEmbed,
	parseExperimentalBalanceResponse,
} from '../util/balanceDisplay.js';
import { rememberBalanceRun } from '../util/balanceRunCache.js';
import {
	applyResultEmbedAfterInput,
} from '../util/balanceResultChannelEmbed.js';
import { formatInputTrajectoryDiscordContent } from '../util/inputTrajectoryReply.js';
import {
	interactionMemberDisplayName,
	plainCodeBlockWithinDiscordContentLimit,
	truncateDiscordReply,
} from '../util/discordText.js';
import {
	isPublicThreadParentChannel,
	runInReplyThread,
	sendBalancerFilesToThread,
} from '../util/replyThread.js';
import { buildBalanceButtonRow } from './balanceButtons.js';
import { BALANCE_POST_RESULT_CHANNEL_ID } from './balanceConstants.js';

const fileOpts = (files: AttachmentBuilder[]) =>
	files.length > 0 ? { files } : {};

function hasCoordinatorRole(interaction: ChatInputCommandInteraction): boolean {
	const { member } = interaction;
	return (
		member instanceof GuildMember &&
		member.roles.cache.some((role) => role.name === 'COORDINATOR')
	);
}

function resolveDailyPlayerName(interaction: ChatInputCommandInteraction): string {
	const nameOpt = interaction.options.getString('name')?.trim() ?? '';
	if (hasCoordinatorRole(interaction) && nameOpt.length > 0) {
		return nameOpt;
	}
	return interactionMemberDisplayName(interaction);
}

type ExperimentalDailyStatsBody = {
	wins?: number;
	losses?: number;
	kills?: number;
	deaths?: number;
	Wins?: number;
	Losses?: number;
	Kills?: number;
	Deaths?: number;
};

function formatDailyStatsReply(body: ExperimentalDailyStatsBody): string {
	const wins = body.wins ?? body.Wins ?? 0;
	const losses = body.losses ?? body.Losses ?? 0;
	const kills = body.kills ?? body.Kills ?? 0;
	const deaths = body.deaths ?? body.Deaths ?? 0;
	return [`Wins: ${wins}`, `Losses: ${losses}`, `Kills: ${kills}`, `Deaths: ${deaths}`].join(
		'\n',
	);
}

/** Trajectory table fence, else ProblemDetails-style text if present, else JSON in a plain fence. */
function formatInputUninputSuccessContent(parsedResponse: unknown): string {
	const trajectoryContent = formatInputTrajectoryDiscordContent(parsedResponse);
	if (trajectoryContent !== null) {
		return trajectoryContent;
	}
	const detail = extractProblemDetailFromParsedJson(parsedResponse);
	if (detail !== null) {
		return plainCodeBlockWithinDiscordContentLimit(detail);
	}
	return plainCodeBlockWithinDiscordContentLimit(
		JSON.stringify(parsedResponse, null, 2),
	);
}

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

/**
 * For `/experimental run` failures: full `errorContent` on the slash reply; JSON
 * attachments only in a new thread on that reply when the channel supports it.
 * Falls back to a single reply with error + files when threading is unavailable.
 */
async function dispatchExperimentalRunFailure(
	interaction: ChatInputCommandInteraction,
	params: {
		errorContent: string;
		files: AttachmentBuilder[];
	},
): Promise<void> {
	const threadTitle = 'Error';
	const threadTitleWhenEmpty = 'Error';
	const { errorContent, files } = params;
	const fallbackPayload = {
		content: errorContent,
		...fileOpts(files),
	};
	const ch = interaction.channel;

	if (ch instanceof ThreadChannel) {
		await interaction.editReply({ content: errorContent });
		await sendBalancerFilesToThread(ch, files);
		return;
	}

	if (isPublicThreadParentChannel(ch)) {
		await interaction.editReply({ content: errorContent });
		if (files.length === 0) {
			return;
		}
		const starterMsg = await interaction.fetchReply();
		await runInReplyThread({
			interaction,
			starterMessage: starterMsg,
			threadTitle,
			threadTitleWhenEmpty,
			logLabel: 'experimental run (error): failed to create or post in thread',
			onNoThreadParent: async () => {
				await interaction.editReply(fallbackPayload);
			},
			onThreadOpenError: async () => {
				await interaction.editReply(fallbackPayload);
			},
			inThread: async (thread) => {
				await sendBalancerFilesToThread(thread, files);
			},
		});
		return;
	}

	await interaction.editReply(fallbackPayload);
}

const EXPERIMENTAL_SPECS_ORDERED: readonly string[] = [
	'Pyromancer',
	'Cryomancer',
	'Aquamancer',
	'Berserker',
	'Defender',
	'Revenant',
	'Avenger',
	'Crusader',
	'Protector',
	'Thunderlord',
	'Spiritguard',
	'Earthwarden',
	'Assassin',
	'Vindicator',
	'Apothecary',
	'Conjurer',
	'Sentinel',
	'Luminary',
] as const;

type ExperimentalSpecLogsResponse = {
	count: number;
	log: Record<string, string[]>;
};

function isSpecLogsResponse(value: unknown): value is ExperimentalSpecLogsResponse {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const o = value as Record<string, unknown>;
	if (typeof o.count !== 'number' || o.log === null || typeof o.log !== 'object') {
		return false;
	}
	return Object.values(o.log as Record<string, unknown>).every(
		(v) => Array.isArray(v) && v.every((name) => typeof name === 'string'),
	);
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
				.setDescription('Undo input (POST …/uninput; same JSON as input)')
				.addStringOption((o) =>
					o
						.setName('balance_id')
						.setDescription('Balance UUID')
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName('body')
						.setDescription('JSON body (winners, losers, game_id — must match stored input)')
						.setRequired(true),
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
		)
		.addSubcommand((sub) =>
			sub
				.setName('logs')
				.setDescription('Spec assignment history (GET /experimental/logs)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('logs-truncate')
				.setDescription('Truncate oldest spec logs (POST /experimental/logs/truncate)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('logs-clear')
				.setDescription('Clear all spec logs (POST /experimental/logs/clear)'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('daily')
				.setDescription("Today's W/L/K/D for a player")
				.addStringOption((o) =>
					o.setName('name').setDescription('Player name').setRequired(false),
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

			let res: Response;
			let requestBody: string | undefined;
			try {
				const out = await balancerFetch('/experimental/balance', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body,
				});
				res = out.response;
				requestBody = out.requestBody;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : 'Could not reach Balancer API.';
				const synthetic = JSON.stringify({ error: message }, null, 2);
				await dispatchExperimentalRunFailure(interaction, {
					errorContent: message,
					files: balancerApiJsonAttachments(body, synthetic),
				});
				return;
			}

			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await dispatchExperimentalRunFailure(interaction, {
					errorContent: formatFailedApiBody(res.status, rawBody),
					files,
				});
				return;
			}
			const parsedUnknown = parseJsonBody(rawBody);
			const parsed = parseExperimentalBalanceResponse(parsedUnknown);
			if (parsed === null) {
				await dispatchExperimentalRunFailure(interaction, {
					errorContent: 'Balance API returned an unexpected JSON shape.',
					files,
				});
				return;
			}
			const embeds = experimentalBalanceEmbeds(parsed);
			const warnEmbed = experimentalRepeatSpecWarningEmbed(parsed);
			const firstEmbed = embeds[0];
			if (firstEmbed === undefined) {
				await dispatchExperimentalRunFailure(interaction, {
					errorContent: 'Could not build balance embed.',
					files,
				});
				return;
			}

			await interaction.editReply({
				content: `\`\`\`\n${playersRaw}\n\`\`\``,
			});
			const starterMsg = await interaction.fetchReply();

			const postBalanceInChannel = async (
				target: GuildTextBasedChannel | ThreadChannel,
			) => {
				const balanceEmbeds = warnEmbed !== null ? [firstEmbed, warnEmbed] : [firstEmbed];
				return target.send({
					embeds: balanceEmbeds,
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

			await runInReplyThread({
				interaction,
				starterMessage: starterMsg,
				threadTitle: parsed.balance_id,
				threadTitleWhenEmpty: parsed.balance_id,
				logLabel: 'experimental run: failed to create or post in thread',
				onNoThreadParent: async () => {
					await interaction.followUp({
						content:
							'Use `/experimental run` in a text or announcement channel so a thread can be created.',
						flags: MessageFlags.Ephemeral,
					});
				},
				onThreadOpenError: async () => {
					await interaction.followUp({
						content:
							'Could not create a thread or post inside it. Check **Create Public Threads** and **Send Messages in Threads** for the bot.',
						flags: MessageFlags.Ephemeral,
					});
				},
				inThread: async (thread) => {
					const threadMsg = await postBalanceInChannel(thread);
					rememberBalanceRun(
						threadMsg.id,
						interaction.user.id,
						players,
						parsed,
					);
				},
			});
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
			const { response: res } = await balancerFetch(
				`/experimental/balance/${balanceId}/generate-input`,
				{ method: 'GET' },
			);
			const rawBody = await res.text();
			const pretty = parseJsonBody(rawBody);
			await interaction.editReply({
				files: [jsonDiscordAttachment('response.json', pretty)],
			});
			return;
		}

		if (sub === 'daily') {
			const effectiveName = resolveDailyPlayerName(interaction);
			let res: Response;
			let requestBody: string | undefined;
			try {
				const out = await balancerFetch(
					`/experimental/daily/${encodeURIComponent(effectiveName)}`,
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

			const body = parseJsonBody(rawBody) as ExperimentalDailyStatsBody;
			await interaction.editReply({
				content: formatDailyStatsReply(body),
				...fileOpts(files),
			});
			return;
		}

		if (sub === 'logs' || sub === 'logs-truncate' || sub === 'logs-clear') {
			let res: Response;
			let requestBody: string | undefined;
			try {
				const out =
					sub === 'logs'
						? await balancerFetch('/experimental/logs', { method: 'GET' })
						: sub === 'logs-truncate'
							? await balancerFetch('/experimental/logs/truncate', { method: 'POST' })
							: await balancerFetch('/experimental/logs/clear', { method: 'POST' });
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

			const parsed = parseJsonBody(rawBody);
			if (!isSpecLogsResponse(parsed)) {
				await interaction.editReply({
					content: 'Logs API returned an unexpected JSON shape.',
					...fileOpts(files),
				});
				return;
			}

			const prefix =
				sub === 'logs'
					? `**${parsed.count}** logged balance(s).`
					: sub === 'logs-truncate'
						? `**${parsed.count}** balance(s) removed.`
						: `**${parsed.count}** balance(s) cleared.`;
			await interaction.editReply({
				content: `${prefix}`,
				...fileOpts(files),
			});
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
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts(files),
				});
				return;
			}
			const parsedResponse = parseJsonBody(rawBody);
			const content = formatInputUninputSuccessContent(parsedResponse);
			await interaction.editReply({
				content,
				...fileOpts(files),
			});
			try {
				await applyResultEmbedAfterInput(
					interaction.client,
					BALANCE_POST_RESULT_CHANNEL_ID,
					balanceId,
					parsedBody,
				);
			} catch (err) {
				console.error('balance result embed update failed', err);
			}
			return;
		}

		if (sub === 'uninput') {
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
				`/experimental/balance/${balanceId}/uninput`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: serialized,
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
			const parsedResponse = parseJsonBody(rawBody);
			const content = formatInputUninputSuccessContent(parsedResponse);
			await interaction.editReply({
				content,
				...fileOpts(files),
			});
		}
	},
};
