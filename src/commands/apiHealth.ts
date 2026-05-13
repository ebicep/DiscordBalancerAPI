import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
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

		let response: Response;
		try {
			const result = await balancerFetch('/health');
			response = result.response;
		} catch (err) {
			console.error('api-health failed', err);
			const message = err instanceof Error ? err.message : 'Could not reach Balancer API.';
			await interaction.editReply(message);
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
