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

type WeeklyAdjustPatchEntry = {
	uuid: string;
	name: string;
	spec: string;
	autoSpecDelta: number;
	manualSpecDelta: number;
	netSpecDelta: number;
	patchAdjusted: number;
	executed: boolean;
	previousOffset: number;
	currentOffset: number;
	previousWeight: number;
	currentWeight: number;
	weightChange: number;
	baseWeight: number;
};

type WeeklyAdjustPatchBody = {
	count: number;
	recordedAt: string;
	cutoff: string;
	adjusted: WeeklyAdjustPatchEntry[];
};

function signed(n: number): string {
	return n >= 0 ? `+${n}` : `${n}`;
}

function formatWeeklyAdjustPatchLine(e: WeeklyAdjustPatchEntry): string {
	const execNote = e.executed ? '' : ' (not executed)';
	return `${e.name} (${e.spec}) offset ${e.previousOffset} > ${e.currentOffset}, weight ${e.previousWeight} > ${e.currentWeight} (${signed(e.weightChange)})${execNote}`;
}

function formatWeeklyAdjustPatchContent(body: WeeklyAdjustPatchBody): string {
	const header = `Weekly adjust patch: ${body.count} executed spec adjustment(s). Cutoff ${body.cutoff}.`;
	const entries = body.adjusted ?? [];
	if (entries.length === 0) {
		return header;
	}
	const { lines, truncated } = takeLinesUntilBudget(
		entries,
		MAX_MESSAGE_BLOCK_LEN,
		formatWeeklyAdjustPatchLine,
	);
	const block = `\`\`\`\n${lines.join('\n')}\n\`\`\``;
	const suffix = truncated ? '\n… (truncated; see response.json)' : '';
	return `${header}\n${block}${suffix}`;
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
			console.error('patch: followUp with artifacts failed', followErr);
		}
	};
	await runInReplyThread({
		interaction,
		threadTitle,
		threadTitleWhenEmpty: 'Patch',
		logLabel: 'patch: failed to post request/response artifacts',
		onNoThreadParent,
		onThreadOpenError,
		inThread: async (thread) => {
			await thread.send({ files });
		},
	});
}

export const patch = {
	data: new SlashCommandBuilder()
		.setName('patch')
		.setDescription('One-off Balancer API patch operations')
		.addSubcommand((sub) =>
			sub
				.setName('weekly-adjusts')
				.setDescription(
					'Retroactive weekly auto-adjust patch (PATCH /patch/weekly-adjusts)',
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();

		if (sub === 'weekly-adjusts') {
			const { response: res, requestBody } = await balancerFetch(
				'/patch/weekly-adjusts',
				{ method: 'PATCH' },
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
					`Patch weekly-adjusts — HTTP ${res.status}`,
				);
				return;
			}
			const parsed = parseJsonBody(rawBody) as WeeklyAdjustPatchBody;
			await interaction.editReply({
				content: formatWeeklyAdjustPatchContent(parsed),
			});
			await postRequestResponseArtifacts(
				interaction,
				files,
				`Weekly adjust patch (${parsed.count} executed)`,
			);
		}
	},
};
