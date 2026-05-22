import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { MAX_MESSAGE_BLOCK_LEN } from '../discordLimits.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { takeLinesUntilBudget } from '../util/discordText.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import { runInReplyThread } from '../util/replyThread.js';

const SPECS: readonly string[] = [
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

function signed(n: number): string {
	return n >= 0 ? `+${n}` : `${n}`;
}

function formatAdjustLine(
	name: string,
	label: string,
	oldWeight: number,
	newWeight: number,
): string {
	const diff = newWeight - oldWeight;
	return `Adjusted ${name} (${label}) from ${oldWeight} > ${newWeight} (${signed(diff)})`;
}

function formatAutoDailyAdjustLine(
	name: string,
	label: string,
	oldWeight: number,
	newWeight: number,
	oldTrajectory: number,
	newTrajectory: number,
): string {
	return `${formatAdjustLine(name, label, oldWeight, newWeight)} [${oldTrajectory} > ${newTrajectory}]`;
}

/** Thread title: e.g. `sumSmash (BASE) from 270 > 270 (+0)` — no leading `Adjusted `. */
function formatAdjustThreadTitle(
	name: string,
	label: string,
	oldWeight: number,
	newWeight: number,
): string {
	const diff = newWeight - oldWeight;
	return `${name} (${label}) from ${oldWeight} > ${newWeight} (${signed(diff)})`;
}

async function postRequestResponseArtifacts(
	interaction: ChatInputCommandInteraction,
	files: ReturnType<typeof balancerApiJsonAttachments>,
	threadTitle: string,
): Promise<void> {
	if (files.length === 0) {
		return;
	}
	const onNoThreadParent = async (): Promise<void> => {
		await interaction.followUp({ files });
	};
	const onThreadOpenError = async (): Promise<void> => {
		try {
			await interaction.followUp({
				content:
					'Could not open a thread for request/response files. Posting them here.',
				files,
				flags: MessageFlags.Ephemeral,
			});
		} catch (followErr) {
			console.error('adjust: followUp with artifacts failed', followErr);
		}
	};
	await runInReplyThread({
		interaction,
		threadTitle,
		threadTitleWhenEmpty: 'Adjust',
		logLabel: 'adjust: failed to post request/response artifacts',
		onNoThreadParent,
		onThreadOpenError,
		inThread: async (thread) => {
			await thread.send({ files });
		},
	});
}

type AutoDailyEntry = {
	uuid: string;
	name: string;
	previousWeight: number;
	currentWeight: number;
	previousTrajectory: number;
	newTrajectory: number;
};

type AutoDailyBody = {
	count: number;
	date?: string;
	adjusted: AutoDailyEntry[];
};

type BaseAdjustBody = {
	uuid: string;
	name: string;
	previousWeight: number;
	newWeight: number;
	previousTrajectory: number;
	newTrajectory: number;
};

type SpecAdjustBody = {
	uuid: string;
	name: string;
	spec: string;
	previousOffset: number;
	newOffset: number;
	baseWeight: number;
	previousSpecWeight: number;
	newSpecWeight: number;
};

function autoDailyThreadTitle(body: AutoDailyBody): string {
	const first = (body.adjusted ?? [])[0];
	if (first === undefined) {
		return `Auto-daily (${body.count} players)`;
	}
	return `${formatAdjustThreadTitle(
		first.name,
		'BASE',
		first.previousWeight,
		first.currentWeight,
	)} [${first.previousTrajectory} > ${first.newTrajectory}]`;
}

function formatAutoDailyContent(
	body: AutoDailyBody,
	headerPrefix = 'Auto-daily applied to',
): string {
	const header = `${headerPrefix} ${body.count} player(s).`;
	const entries = body.adjusted ?? [];
	if (entries.length === 0) {
		return header;
	}
	const { lines, truncated } = takeLinesUntilBudget(
		entries,
		MAX_MESSAGE_BLOCK_LEN,
		(e) =>
			formatAutoDailyAdjustLine(
				e.name,
				'BASE',
				e.previousWeight,
				e.currentWeight,
				e.previousTrajectory,
				e.newTrajectory,
			),
	);
	const block = `\`\`\`\n${lines.join('\n')}\n\`\`\``;
	const suffix = truncated ? '\n… (truncated; see response.json)' : '';
	return `${header}\n${block}${suffix}`;
}

export const adjust = {
	data: new SlashCommandBuilder()
		.setName('adjust')
		.setDescription('Apply weight adjustments via the Balancer API')
		.addSubcommand((sub) =>
			sub
				.setName('auto-daily')
				.setDescription(
					'Apply auto-daily adjustments (POST /adjust/auto-daily)',
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('undo-auto-daily')
				.setDescription(
					'Undo auto-daily adjustments (POST /adjust/undo-auto-daily)',
				)
				.addStringOption((o) =>
					o
						.setName('body')
						.setDescription(
							'JSON body from auto-daily response (count, date, adjusted)',
						)
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('base')
				.setDescription(
					'Manually adjust a player base weight (PATCH /adjust/base/{player})',
				)
				.addStringOption((o) =>
					o
						.setName('player')
						.setDescription('Player name or UUID')
						.setRequired(true),
				)
				.addIntegerOption((o) =>
					o
						.setName('amount')
						.setDescription('Amount to add (can be negative)')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('spec')
				.setDescription(
					'Manually adjust a player spec offset (PATCH /adjust/spec/{player})',
				)
				.addStringOption((o) =>
					o
						.setName('player')
						.setDescription('Player name or UUID')
						.setRequired(true),
				)
				.addIntegerOption((o) =>
					o
						.setName('amount')
						.setDescription('Amount to add to the spec offset (can be negative)')
						.setRequired(true),
				)
				.addStringOption((o) => {
					const opt = o
						.setName('spec')
						.setDescription('Spec to adjust')
						.setRequired(true);
					for (const s of SPECS) {
						opt.addChoices({ name: s, value: s });
					}
					return opt;
				}),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();

		if (sub === 'auto-daily') {
			const { response: res, requestBody } = await balancerFetch(
				'/adjust/auto-daily',
				{ method: 'POST' },
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
				});
				await postRequestResponseArtifacts(
					interaction,
					files,
					`Adjust — HTTP ${res.status}`,
				);
				return;
			}
			const parsed = parseJsonBody(rawBody) as AutoDailyBody;
			await interaction.editReply({
				content: formatAutoDailyContent(parsed),
			});
			await postRequestResponseArtifacts(
				interaction,
				files,
				autoDailyThreadTitle(parsed),
			);
			return;
		}

		if (sub === 'undo-auto-daily') {
			const bodyRaw = interaction.options.getString('body', true);
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
				'/adjust/undo-auto-daily',
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
				});
				await postRequestResponseArtifacts(
					interaction,
					files,
					`Adjust undo — HTTP ${res.status}`,
				);
				return;
			}
			const parsed = parseJsonBody(rawBody) as AutoDailyBody;
			await interaction.editReply({
				content: formatAutoDailyContent(parsed, 'Auto-daily undone for'),
			});
			await postRequestResponseArtifacts(
				interaction,
				files,
				autoDailyThreadTitle(parsed),
			);
			return;
		}

		if (sub === 'base') {
			const player = interaction.options.getString('player', true).trim();
			const amount = interaction.options.getInteger('amount', true);
			if (player === '') {
				await interaction.editReply({
					content: '`player` is required.',
				});
				return;
			}
			const body = JSON.stringify({ amount });
			const { response: res, requestBody } = await balancerFetch(
				`/adjust/base/${encodeURIComponent(player)}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body,
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
				});
				await postRequestResponseArtifacts(
					interaction,
					files,
					`Adjust — HTTP ${res.status}`,
				);
				return;
			}
			const parsed = parseJsonBody(rawBody) as BaseAdjustBody;
			await interaction.editReply({
				content: formatAutoDailyAdjustLine(
					parsed.name,
					'BASE',
					parsed.previousWeight,
					parsed.newWeight,
					parsed.previousTrajectory,
					parsed.newTrajectory,
				),
			});
			await postRequestResponseArtifacts(
				interaction,
				files,
				`${formatAdjustThreadTitle(
					parsed.name,
					'BASE',
					parsed.previousWeight,
					parsed.newWeight,
				)} [${parsed.previousTrajectory} > ${parsed.newTrajectory}]`,
			);
			return;
		}

		if (sub === 'spec') {
			const player = interaction.options.getString('player', true).trim();
			const amount = interaction.options.getInteger('amount', true);
			const spec = interaction.options.getString('spec', true);
			if (player === '') {
				await interaction.editReply({
					content: '`player` is required.',
				});
				return;
			}
			const body = JSON.stringify({ amount, spec });
			const { response: res, requestBody } = await balancerFetch(
				`/adjust/spec/${encodeURIComponent(player)}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body,
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
				});
				await postRequestResponseArtifacts(
					interaction,
					files,
					`Adjust — HTTP ${res.status}`,
				);
				return;
			}
			const parsed = parseJsonBody(rawBody) as SpecAdjustBody;
			await interaction.editReply({
				content: formatAdjustLine(
					parsed.name,
					parsed.spec,
					parsed.previousSpecWeight,
					parsed.newSpecWeight,
				),
			});
			await postRequestResponseArtifacts(
				interaction,
				files,
				formatAdjustThreadTitle(
					parsed.name,
					parsed.spec,
					parsed.previousSpecWeight,
					parsed.newSpecWeight,
				),
			);
		}
	},
};
