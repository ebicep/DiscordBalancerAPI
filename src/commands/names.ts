import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { MAX_MESSAGE_BLOCK_LEN } from '../discordLimits.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { takeLinesUntilBudget } from '../util/discordText.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import { runInReplyThread, sendBalancerFilesToThread } from '../util/replyThread.js';

type UpdatedNameEntry = {
	uuid: string;
	previous: string;
	current: string;
};

type NamesUpdateBody = {
	updated?: UpdatedNameEntry[];
};

const THREAD_NAME = 'Updating Names';

function namesCodeBlock(updated: UpdatedNameEntry[]): string {
	if (updated.length === 0) {
		return '```txt\nNo names changed.\n```';
	}

	const { lines, truncated } = takeLinesUntilBudget(
		updated,
		MAX_MESSAGE_BLOCK_LEN,
		(row) => `${row.previous} > ${row.current}`,
	);

	const suffix = truncated ? '\n... (truncated; see response.json)' : '';
	return `\`\`\`txt\n${lines.join('\n')}\n\`\`\`${suffix}`;
}

async function postNamesOutputs(
	interaction: ChatInputCommandInteraction,
	files: ReturnType<typeof balancerApiJsonAttachments>,
	detailContent: string,
	options?: { summaryLine?: string },
): Promise<void> {
	const ephemeralFallback = async (): Promise<void> => {
		const fileOpts = files.length > 0 ? { files } : {};
		try {
			await interaction.followUp({
				content:
					'Could not open a thread for request/response files. Posting them here.',
				flags: MessageFlags.Ephemeral,
				...fileOpts,
			});
			await interaction.followUp({
				content: detailContent,
				flags: MessageFlags.Ephemeral,
			});
			if (options?.summaryLine !== undefined) {
				await interaction.followUp({
					content: options.summaryLine,
					flags: MessageFlags.Ephemeral,
				});
			}
		} catch (followErr) {
			console.error('names: fallback followUp failed', followErr);
		}
	};
	await runInReplyThread({
		interaction,
		threadTitle: THREAD_NAME,
		threadTitleWhenEmpty: THREAD_NAME,
		logLabel: 'names: failed to post outputs',
		onNoThreadParent: ephemeralFallback,
		inThread: async (thread) => {
			await sendBalancerFilesToThread(thread, files);
			await thread.send({ content: detailContent });
			if (options?.summaryLine !== undefined) {
				await thread.send({ content: options.summaryLine });
			}
		},
	});
}

export const names = {
	data: new SlashCommandBuilder()
		.setName('names')
		.setDescription('Update player names from Mojang (NamesUpdate)')
		.addSubcommand((sub) =>
			sub
				.setName('update')
				.setDescription('Update known player names (POST /names/update)'),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		await interaction.editReply({ content: 'Updating Names' });

		const sub = interaction.options.getSubcommand();
		if (sub !== 'update') {
			return;
		}

		const { response: res, requestBody } = await balancerFetch('/names/update', {
			method: 'POST',
		});
		const rawBody = await res.text();
		const files = balancerApiJsonAttachments(requestBody, rawBody);

		if (!res.ok) {
			const failure = formatFailedApiBody(res.status, rawBody);
			await interaction.editReply({ content: failure });
			await postNamesOutputs(
				interaction,
				files,
				`Request failed with HTTP ${res.status}.`,
			);
			return;
		}

		const parsed = parseJsonBody(rawBody) as NamesUpdateBody;
		const updated = Array.isArray(parsed.updated) ? parsed.updated : [];
		const content = namesCodeBlock(updated);
		const count = updated.length;
		await postNamesOutputs(interaction, files, content, {
			summaryLine: `Updated ${count} name(s).`,
		});
	},
};
