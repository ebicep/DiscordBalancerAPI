import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import { getEnv } from '../config/env.js';
import { extractErrnoCode } from '../util/apiErrorMessage.js';

type HealthBody = {
	status?: unknown;
};

function parseHealthStatus(rawBody: string): string | undefined {
	const trimmed = rawBody.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(trimmed) as HealthBody;
		return typeof parsed.status === 'string' ? parsed.status : undefined;
	} catch {
		return trimmed;
	}
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
		const status = parseHealthStatus(rawBody);
		const health =
			status?.toLowerCase() === 'healthy' && response.ok
				? 'healthy'
				: 'unhealthy';
		const apiStatus = status !== undefined ? `, status: ${status}` : '';

		await interaction.editReply(
			`Balancer API health: **${health}** (HTTP ${response.status}${apiStatus}).`,
		);
	},
};
