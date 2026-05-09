import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { truncateDiscordReply } from '../util/discordText.js';
import { balancerApiJsonAttachments } from '../util/jsonDiscordAttachment.js';

type SettingsListBody = { data: Record<string, number> };

type SettingOneBody = {
	data: {
		key: string;
		value: number;
		displayName: string | null;
	};
};

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
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub === 'list') {
			const { response: res, requestBody } = await balancerFetch('/settings', {
				method: 'GET',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...(files.length > 0 ? { files } : {}),
				});
				return;
			}
			const body = JSON.parse(rawBody) as SettingsListBody;
			const entries = Object.entries(body.data ?? {}).sort(([a], [b]) =>
				a.localeCompare(b),
			);
			const lines = entries.map(([k, v]) => `${k}: ${v}`);
			const content =
				lines.length === 0
					? '_No settings returned._'
					: truncateDiscordReply(['```', ...lines, '```'].join('\n'));
			await interaction.editReply({
				content,
				...(files.length > 0 ? { files } : {}),
			});
			return;
		}
		if (sub === 'get') {
			const key = interaction.options.getString('key', true);
			const { response: res, requestBody } = await balancerFetch(
				`/settings/${encodeURIComponent(key)}`,
				{
					method: 'GET',
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...(files.length > 0 ? { files } : {}),
				});
				return;
			}
			const body = JSON.parse(rawBody) as SettingOneBody;
			const d = body.data;
			const display =
				d.displayName != null && d.displayName !== ''
					? `\n**Display:** ${d.displayName}`
					: '';
			await interaction.editReply({
				content: `**${d.key}** = \`${d.value}\`${display}`,
				...(files.length > 0 ? { files } : {}),
			});
			return;
		}
		if (sub === 'set') {
			const key = interaction.options.getString('key', true);
			const value = interaction.options.getNumber('value', true);
			const { response: res, requestBody } = await balancerFetch(
				`/settings/${encodeURIComponent(key)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ value }),
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
					...(files.length > 0 ? { files } : {}),
				});
				return;
			}
			const body = JSON.parse(rawBody) as SettingOneBody;
			const d = body.data;
			await interaction.editReply({
				content: `Updated **${d.key}** = \`${d.value}\``,
				...(files.length > 0 ? { files } : {}),
			});
			return;
		}
	},
};
