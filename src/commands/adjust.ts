import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { MAX_MESSAGE_BLOCK_LEN } from '../discordLimits.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import {
	chunkPlainCodeBlocksForDiscord,
	takeLinesUntilBudget,
} from '../util/discordText.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import { runInReplyThread, sendBalancerFilesToThread } from '../util/replyThread.js';

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

function formatAdjustHistoryDate(iso: string): string {
	const d = new Date(iso);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}/${m}/${day}`;
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

type BaseHistoryEntry = {
	id: string;
	date: string;
	source: string;
	previousWeight: number;
	newWeight: number;
};

type BaseHistoryBody = {
	name: string;
	uuid: string;
	entries: BaseHistoryEntry[];
};

type SpecHistoryEntry = {
	id: string;
	date: string;
	source: string;
	spec: string;
	weekKey: number | null;
	wins: number | null;
	losses: number | null;
	adjusted: number | null;
	previousOffset: number;
	newOffset: number;
	previousSpecWeight: number;
	newSpecWeight: number;
};

type SpecHistoryBody = {
	name: string;
	uuid: string;
	entries: SpecHistoryEntry[];
};

function formatBaseHistoryLine(entry: BaseHistoryEntry): string {
	const date = `[${formatAdjustHistoryDate(entry.date)}]`;
	const tag = entry.source === 'auto' ? 'Auto' : 'Manual';
	const diff = entry.newWeight - entry.previousWeight;
	return `${date} [${tag}] (BASE) (${entry.previousWeight} > ${entry.newWeight}) (${signed(diff)})`;
}

function formatSpecHistoryLine(entry: SpecHistoryEntry): string {
	const date = `[${formatAdjustHistoryDate(entry.date)}]`;
	if (entry.source === 'auto') {
		return `${date} [Auto] (${entry.spec}) (Week ${entry.weekKey ?? '?'}) (Weight ${entry.previousSpecWeight} > ${entry.newSpecWeight}) (Offset ${entry.previousOffset} > ${entry.newOffset})`;
	}
	return `${date} [Manual] (${entry.spec}) (Spec Weight ${entry.previousSpecWeight} > ${entry.newSpecWeight}) (Offset ${entry.previousOffset} > ${entry.newOffset})`;
}

type PlayerLookupBody = {
	uuid?: string;
	Uuid?: string;
};

async function resolveBalancerPlayerUuid(
	playerKey: string,
): Promise<{ uuid: string } | { message: string }> {
	const { response: res } = await balancerFetch(
		`/player/${encodeURIComponent(playerKey)}`,
		{ method: 'GET' },
	);
	const rawBody = await res.text();
	if (!res.ok) {
		return { message: formatFailedApiBody(res.status, rawBody) };
	}
	const parsed = parseJsonBody(rawBody) as PlayerLookupBody;
	const uuid = parsed.uuid ?? parsed.Uuid;
	if (typeof uuid !== 'string' || uuid.trim() === '') {
		return { message: 'Player response missing uuid.' };
	}
	return { uuid: uuid.trim() };
}

function historyResponseTitle(
	body: { name: string; uuid: string; entries: unknown[] },
	kind: 'base' | 'spec',
): string {
	const label = body.name && body.name !== '' ? body.name : body.uuid;
	const kindWord = kind === 'base' ? 'Base' : 'Spec';
	const count = body.entries?.length ?? 0;
	return `${label} ${kindWord} Adjustment History (${count} Entries)`;
}

async function deliverAdjustHistory(
	interaction: ChatInputCommandInteraction,
	kind: 'base' | 'spec',
	uuid: string,
): Promise<void> {
	const path =
		kind === 'base'
			? `/adjust/history/base/${encodeURIComponent(uuid)}`
			: `/adjust/history/spec/${encodeURIComponent(uuid)}`;
	const threadSuffix =
		kind === 'base' ? 'Base Adjust History' : 'Spec Adjust History';

	const { response: res, requestBody } = await balancerFetch(path, {
		method: 'GET',
	});
	const rawBody = await res.text();
	const files = balancerApiJsonAttachments(requestBody, rawBody);

	if (!res.ok) {
		await interaction.editReply({
			content: formatFailedApiBody(res.status, rawBody),
		});
		await postRequestResponseArtifacts(
			interaction,
			files,
			`Adjust history — HTTP ${res.status}`,
		);
		return;
	}

	const parsed =
		kind === 'base'
			? (parseJsonBody(rawBody) as BaseHistoryBody)
			: (parseJsonBody(rawBody) as SpecHistoryBody);

	const entries = parsed.entries ?? [];
	const lines =
		kind === 'base'
			? entries.map((e) => formatBaseHistoryLine(e as BaseHistoryEntry))
			: entries.map((e) => formatSpecHistoryLine(e as SpecHistoryEntry));
	const inner = lines.join('\n');
	const chunks = chunkPlainCodeBlocksForDiscord(
		inner.length > 0 ? inner : '_No history entries._',
	);
	const displayName =
		parsed.name && parsed.name !== '' ? parsed.name : parsed.uuid;

	await interaction.editReply({
		content: historyResponseTitle(parsed, kind),
	});

	const onNoThreadParent = async (): Promise<void> => {
		if (chunks.length > 0) {
			await interaction.followUp({ content: chunks[0] });
			for (const chunk of chunks.slice(1)) {
				await interaction.followUp({ content: chunk });
			}
		}
		if (files.length > 0) {
			await interaction.followUp({ files });
		}
	};

	await runInReplyThread({
		interaction,
		threadTitle: `${displayName} — ${threadSuffix}`,
		threadTitleWhenEmpty: 'Adjust history',
		logLabel: `adjust history-${kind}: failed to post history`,
		onNoThreadParent,
		onThreadOpenError: onNoThreadParent,
		inThread: async (thread) => {
			for (const chunk of chunks) {
				await thread.send({ content: chunk });
			}
			await sendBalancerFilesToThread(thread, files);
		},
	});
}

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
						.setDescription(
							'Value to add, or absolute weight when set is true (can be negative)',
						)
						.setRequired(true),
				)
				.addBooleanOption((o) =>
					o
						.setName('set')
						.setDescription(
							'If true, set the value to amount instead of adding',
						),
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
						.setDescription(
							'Value to add to the offset, or absolute effective spec weight when set is true (can be negative)',
						)
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
				})
				.addBooleanOption((o) =>
					o
						.setName('set')
						.setDescription(
							'If true, set the value to amount instead of adding',
						),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('history-base')
				.setDescription(
					'View merged base adjustment history (GET /adjust/history/base/{uuid})',
				)
				.addStringOption((o) =>
					o
						.setName('name')
						.setDescription('Player name or UUID')
						.setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('history-spec')
				.setDescription(
					'View merged spec adjustment history (GET /adjust/history/spec/{uuid})',
				)
				.addStringOption((o) =>
					o
						.setName('name')
						.setDescription('Player name or UUID')
						.setRequired(false),
				),
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
			const set = interaction.options.getBoolean('set') ?? false;
			if (player === '') {
				await interaction.editReply({
					content: '`player` is required.',
				});
				return;
			}
			const body = JSON.stringify({ amount, set });
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
			const set = interaction.options.getBoolean('set') ?? false;
			if (player === '') {
				await interaction.editReply({
					content: '`player` is required.',
				});
				return;
			}
			const body = JSON.stringify({ amount, spec, set });
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
			return;
		}

		if (sub === 'history-base' || sub === 'history-spec') {
			const effectiveName = resolveOptionalPlayerName(interaction);
			const resolved = await resolveBalancerPlayerUuid(effectiveName);
			if ('message' in resolved) {
				await interaction.editReply({ content: resolved.message });
				return;
			}
			await deliverAdjustHistory(
				interaction,
				sub === 'history-base' ? 'base' : 'spec',
				resolved.uuid,
			);
		}
	},
};
