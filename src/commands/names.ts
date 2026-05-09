import {
	type ChatInputCommandInteraction,
	MessageFlags,
	NewsChannel,
	SlashCommandBuilder,
	TextChannel,
	ThreadAutoArchiveDuration,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';

type UpdatedNameEntry = {
	uuid: string;
	previous: string;
	current: string;
};

type NamesUpdateBody = {
	updated?: UpdatedNameEntry[];
};

const MAX_THREAD_NAME_LEN = 100;
const MAX_BLOCK_LEN = 1800;

const THREAD_NAME = 'Updating Names';

function clampThreadName(raw: string): string {
	const t = raw.trim().replace(/\s+/g, ' ');
	if (t.length === 0) {
		return THREAD_NAME;
	}
	if (t.length <= MAX_THREAD_NAME_LEN) {
		return t;
	}
	return `${t.slice(0, MAX_THREAD_NAME_LEN - 1)}…`;
}

function namesCodeBlock(updated: UpdatedNameEntry[]): string {
	if (updated.length === 0) {
		return '```txt\nNo names changed.\n```';
	}

	const lines: string[] = [];
	let usedLen = 0;
	let truncated = false;
	for (const row of updated) {
		const line = `${row.previous} > ${row.current}`;
		const projectedLen = usedLen + line.length + 1;
		if (projectedLen > MAX_BLOCK_LEN) {
			truncated = true;
			break;
		}
		lines.push(line);
		usedLen = projectedLen;
	}

	const suffix = truncated ? '\n... (truncated; see response.json)' : '';
	return `\`\`\`txt\n${lines.join('\n')}\n\`\`\`${suffix}`;
}

async function postNamesOutputs(
	interaction: ChatInputCommandInteraction,
	files: ReturnType<typeof balancerApiJsonAttachments>,
	detailContent: string,
	options?: { summaryLine?: string },
): Promise<void> {
	try {
		const message = await interaction.fetchReply();
		const channel = interaction.channel;
		if (channel instanceof TextChannel || channel instanceof NewsChannel) {
			const thread = await message.startThread({
				name: clampThreadName(THREAD_NAME),
				autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
			});
			if (files.length > 0) {
				await thread.send({ files });
			}
			await thread.send({ content: detailContent });
			if (options?.summaryLine !== undefined) {
				await thread.send({ content: options.summaryLine });
			}
			return;
		}

		const fileOpts = files.length > 0 ? { files } : {};
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
	} catch (err) {
		console.error('names: failed to post outputs', err);
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
	}
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
