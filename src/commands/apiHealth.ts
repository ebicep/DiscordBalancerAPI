import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getEnv } from '../config/env.js';
import { extractErrnoCode } from '../util/apiErrorMessage.js';
import { balancerApiJsonAttachments } from '../util/jsonDiscordAttachment.js';
import { runInReplyThread, sendBalancerFilesToThread } from '../util/replyThread.js';

type HealthBody = {
	status?: unknown;
};

const THREAD_NAME = 'API Health';

function parseAggregateStatus(rawBody: string): string | undefined {
	const trimmed = rawBody.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(trimmed) as HealthBody;
		return typeof parsed.status === 'string' ? parsed.status.trim() : undefined;
	} catch {
		return undefined;
	}
}

async function postHealthResponseThread(
	interaction: ChatInputCommandInteraction,
	rawBody: string,
): Promise<void> {
	const files = balancerApiJsonAttachments(undefined, rawBody);
	const ephemeralFallback = async (): Promise<void> => {
		const fileOpts = files.length > 0 ? { files } : {};
		try {
			await interaction.followUp({
				content:
					'Could not open a thread for the health response. Posting JSON here.',
				flags: MessageFlags.Ephemeral,
				...fileOpts,
			});
		} catch (followErr) {
			console.error('api-health: fallback followUp failed', followErr);
		}
	};
	await runInReplyThread({
		interaction,
		threadTitle: THREAD_NAME,
		threadTitleWhenEmpty: THREAD_NAME,
		logLabel: 'api-health: failed to post response thread',
		onNoThreadParent: ephemeralFallback,
		inThread: async (thread) => {
			await sendBalancerFilesToThread(thread, files, '_(empty response body)_');
		},
	});
}

export const apiHealth = {
	data: new SlashCommandBuilder()
		.setName('api-health')
		.setDescription('Check whether the Balancer API is healthy'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();

		const url = `${getEnv().balancerApiBaseUrl}/health`;
		let response: Response;
		try {
			response = await fetch(url, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});
		} catch (err) {
			console.error('api-health failed', { url, err });
			const code = extractErrnoCode(err);
			const suffix = code !== undefined ? ` (${code})` : '';
			await interaction.editReply(`Could not reach Balancer API${suffix}.`);
			return;
		}

		const rawBody = await response.text();
		const aggregate = parseAggregateStatus(rawBody);
		const replyText =
			aggregate !== undefined && aggregate.length > 0
				? aggregate
				: response.ok
					? 'Healthy'
					: 'Unhealthy';

		await interaction.editReply({ content: replyText });
		await postHealthResponseThread(interaction, rawBody);
	},
};
