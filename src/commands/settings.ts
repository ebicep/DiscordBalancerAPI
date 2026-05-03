import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';

const MAX_REPLY_LENGTH = 1900;

function truncate(content: string): string {
	if (content.length <= MAX_REPLY_LENGTH) {
		return content;
	}
	return `${content.slice(0, MAX_REPLY_LENGTH)}…\n_(truncated)_`;
}

type SettingsListBody = { data: Record<string, number> };
type SettingOneBody = {
	data: {
		key: string;
		value: number;
		displayName: string | null;
	};
};

async function safeErrorBody(res: Response): Promise<string> {
	const text = await res.text();
	if (text.length > 500) {
		return `${text.slice(0, 500)}…`;
	}
	return text || res.statusText;
}

export const settings = {
	data: new SlashCommandBuilder()
		.setName('settings')
		.setDescription('Balancer API settings (read/write via API key)')
		.addSubcommand((sub) =>
			sub.setName('list').setDescription('List all settings'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('get')
				.setDescription('Get a setting by key')
				.addStringOption((o) =>
					o.setName('key').setDescription('Setting key').setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('set')
				.setDescription('Create or update a setting')
				.addStringOption((o) =>
					o.setName('key').setDescription('Setting key').setRequired(true),
				)
				.addNumberOption((o) =>
					o.setName('value').setDescription('Numeric value').setRequired(true),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply({ ephemeral: true });
		const sub = interaction.options.getSubcommand();

		if (sub === 'list') {
			const res = await balancerFetch('/settings', { method: 'GET' });
			if (!res.ok) {
				await interaction.editReply(
					`Request failed (${res.status}): ${await safeErrorBody(res)}`,
				);
				return;
			}
			const body = (await res.json()) as SettingsListBody;
			const entries = Object.entries(body.data ?? {}).sort(([a], [b]) =>
				a.localeCompare(b),
			);
			const lines = entries.map(([k, v]) => `${k}: ${v}`);
			const content =
				lines.length === 0
					? '_No settings returned._'
					: truncate(['```', ...lines, '```'].join('\n'));
			await interaction.editReply(content);
			return;
		}

		if (sub === 'get') {
			const key = interaction.options.getString('key', true);
			const res = await balancerFetch(`/settings/${encodeURIComponent(key)}`, {
				method: 'GET',
			});
			if (res.status === 404) {
				await interaction.editReply(`Setting not found: \`${key}\``);
				return;
			}
			if (!res.ok) {
				await interaction.editReply(
					`Request failed (${res.status}): ${await safeErrorBody(res)}`,
				);
				return;
			}
			const body = (await res.json()) as SettingOneBody;
			const d = body.data;
			const display =
				d.displayName != null && d.displayName !== ''
					? `\n**Display:** ${d.displayName}`
					: '';
			await interaction.editReply(
				`**${d.key}** = \`${d.value}\`${display}`,
			);
			return;
		}

		if (sub === 'set') {
			const key = interaction.options.getString('key', true);
			const value = interaction.options.getNumber('value', true);
			const res = await balancerFetch(
				`/settings/${encodeURIComponent(key)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ value }),
				},
			);
			if (res.status === 403) {
				await interaction.editReply(
					'Forbidden (403). This API key may lack SettingsWrite permission.',
				);
				return;
			}
			if (!res.ok) {
				await interaction.editReply(
					`Request failed (${res.status}): ${await safeErrorBody(res)}`,
				);
				return;
			}
			const body = (await res.json()) as SettingOneBody;
			const d = body.data;
			await interaction.editReply(`Updated **${d.key}** = \`${d.value}\``);
			return;
		}
	},
};
