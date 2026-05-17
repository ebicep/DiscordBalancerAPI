import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { MAX_MESSAGE_BLOCK_LEN } from '../discordLimits.js';
import { hasCoordinatorRole } from '../util/coordinatorPlayer.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import {
	interactionMemberDisplayName,
	takeLinesUntilBudget,
	truncateButtonLabel,
} from '../util/discordText.js';
import { BALANCER_EMBED_BLUE } from '../util/embedColors.js';
import {
	balancerApiJsonAttachments,
	parseJsonBody,
} from '../util/jsonDiscordAttachment.js';
import { isPublicThreadParentChannel, runInReplyThread } from '../util/replyThread.js';

type MojangLookupResponse = {
	id?: string;
	name?: string;
};

type PlayerAddBody = {
	name: string;
	uuid: string;
	tablesAdded: string[];
};

type PlayerGetBody = {
	name: string;
	uuid: string;
	data: Record<string, unknown>;
};

type PlayerDeleteBody = {
	name: string;
	uuid: string;
	tablesRemoved: string[];
};

const PLAYER_CONFIRM = 'player:add:confirm';
const PLAYER_CANCEL = 'player:add:cancel';
const DELETE_CONFIRM = 'player:delete:confirm';
const DELETE_CANCEL = 'player:delete:cancel';

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cannotThreadEmbed = new EmbedBuilder()
	.setTitle('Cannot create thread in this channel.')
	.setColor(BALANCER_EMBED_BLUE);

function dashedUuid(uuidNoDash: string): string {
	const compact = uuidNoDash.trim();
	return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

function looksLikeMojangUuid(value: string): boolean {
	return /^[0-9a-fA-F]{32}$/.test(value);
}

function isDashedUuid(value: string): boolean {
	return UUID_RE.test(value.trim());
}

async function resolvePlayerUuid(
	input: string,
): Promise<{ uuid: string; name?: string } | null> {
	const trimmed = input.trim();
	if (trimmed === '') {
		return null;
	}
	if (isDashedUuid(trimmed)) {
		return { uuid: trimmed.toLowerCase() };
	}
	if (looksLikeMojangUuid(trimmed)) {
		return { uuid: dashedUuid(trimmed.toLowerCase()) };
	}
	return lookupMojangProfileByName(trimmed);
}

function confirmationEmbed(uuid: string, name: string, baseWeight: number): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle('Add Player?')
		.setColor(BALANCER_EMBED_BLUE)
		.setDescription(
			`UUID: \`\`\`${uuid}\`\`\`\nIGN: \`\`\`${name}\`\`\`\nWeight: \`\`\`${baseWeight}\`\`\``,
		);
}

function formatPlayerDataSummary(data: Record<string, unknown>): string {
	const entries = Object.entries(data).map(([table, value]) => {
		const count = Array.isArray(value) ? value.length : 1;
		return `${table}: ${count} row(s)`;
	});
	if (entries.length === 0) {
		return '```txt\n(no table data)\n```';
	}
	const { lines, truncated } = takeLinesUntilBudget(
		entries,
		MAX_MESSAGE_BLOCK_LEN,
		(line) => line,
	);
	const suffix = truncated ? '\n… (truncated; full data in response.json)' : '';
	return `\`\`\`txt\n${lines.join('\n')}\n\`\`\`${suffix}`;
}

function deletePreviewEmbed(get: PlayerGetBody): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle('Delete Player?')
		.setColor(BALANCER_EMBED_BLUE)
		.setDescription(
			`UUID: \`\`\`${get.uuid}\`\`\`\nIGN: \`\`\`${get.name}\`\`\`\n\n${formatPlayerDataSummary(get.data)}`,
		);
}

function tablesAddedEmbed(tablesAdded: string[]): EmbedBuilder {
	const description =
		tablesAdded.length > 0 ? tablesAdded.join('\n') : '(none)';
	return new EmbedBuilder()
		.setTitle('Player Added To')
		.setColor(BALANCER_EMBED_BLUE)
		.setDescription(description);
}

function tablesRemovedEmbed(tablesRemoved: string[]): EmbedBuilder {
	const description =
		tablesRemoved.length > 0 ? tablesRemoved.join('\n') : '(none)';
	return new EmbedBuilder()
		.setTitle('Player Removed From')
		.setColor(BALANCER_EMBED_BLUE)
		.setDescription(description);
}

async function lookupMojangProfileByName(name: string): Promise<{ uuid: string; name: string } | null> {
	const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
	if (!response.ok) {
		return null;
	}
	const json = (await response.json()) as MojangLookupResponse;
	if (!json.id || !json.name || !looksLikeMojangUuid(json.id)) {
		return null;
	}
	return { uuid: dashedUuid(json.id.toLowerCase()), name: json.name };
}

function activeButtons(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(PLAYER_CONFIRM)
			.setEmoji('🔨')
			.setLabel('Confirm')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(PLAYER_CANCEL)
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Danger),
	);
}

function deleteActiveButtons(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(DELETE_CONFIRM)
			.setLabel('Confirm')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(DELETE_CANCEL)
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Danger),
	);
}

async function executeAdd(interaction: ChatInputCommandInteraction): Promise<void> {
	const playerInput = interaction.options.getString('player', true).trim();
	const baseWeight = interaction.options.getInteger('base_weight', true);
	if (playerInput === '') {
		await interaction.editReply({ content: '`player` is required.' });
		return;
	}

	const mojang = await lookupMojangProfileByName(playerInput);
	if (mojang === null) {
		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setTitle('Invalid Name')
					.setColor(BALANCER_EMBED_BLUE),
			],
		});
		return;
	}

	const reply = await interaction.editReply({
		embeds: [confirmationEmbed(mojang.uuid, mojang.name, baseWeight)],
		components: [activeButtons()],
	});

	const clicked = await reply.awaitMessageComponent({
		time: 20_000,
		componentType: ComponentType.Button,
		filter: (i) =>
			(i.customId === PLAYER_CONFIRM || i.customId === PLAYER_CANCEL) &&
			hasCoordinatorRole(i),
	}).catch(() => null);

	if (clicked === null) {
		return;
	}

	await clicked.deferUpdate();
	const who = truncateButtonLabel(
		`${clicked.customId === PLAYER_CANCEL ? 'Cancel' : 'Confirm'} (${interactionMemberDisplayName(clicked)})`,
	);
	const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`player:add:done:${clicked.customId}`)
			.setLabel(who)
			.setStyle(clicked.customId === PLAYER_CANCEL ? ButtonStyle.Danger : ButtonStyle.Success)
			.setDisabled(true),
	);

	await interaction.editReply({
		embeds: [confirmationEmbed(mojang.uuid, mojang.name, baseWeight)],
		components: [disabledRow],
	});

	if (clicked.customId === PLAYER_CANCEL) {
		return;
	}

	if (!isPublicThreadParentChannel(interaction.channel)) {
		await interaction.followUp({
			embeds: [cannotThreadEmbed],
		});
		return;
	}

	await runInReplyThread({
		interaction,
		starterMessage: reply,
		threadTitle: `Add Player ${mojang.name}`,
		threadTitleWhenEmpty: 'Add Player',
		logLabel: 'player add: failed to create thread or post result',
		onNoThreadParent: async () => {
			await interaction.followUp({
				embeds: [cannotThreadEmbed],
			});
		},
		inThread: async (thread) => {
			const body = JSON.stringify({ uuid: mojang.uuid, baseWeight });
			const { response: res, requestBody } = await balancerFetch('/player/add', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			const fileOpts = files.length > 0 ? { files } : {};

			if (!res.ok) {
				if (res.status === 409) {
					await thread.send({
						embeds: [
							new EmbedBuilder()
								.setTitle('Player already exists')
								.setColor(BALANCER_EMBED_BLUE),
						],
						...fileOpts,
					});
					return;
				}
				await thread.send({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts,
				});
				return;
			}

			const parsed = parseJsonBody(rawBody) as PlayerAddBody;
			await thread.send({
				embeds: [tablesAddedEmbed(parsed.tablesAdded)],
				...fileOpts,
			});
		},
	});
}

async function executeDelete(interaction: ChatInputCommandInteraction): Promise<void> {
	const playerInput = interaction.options.getString('player', true).trim();
	if (playerInput === '') {
		await interaction.editReply({ content: '`player` is required.' });
		return;
	}

	const resolved = await resolvePlayerUuid(playerInput);
	if (resolved === null) {
		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setTitle('Invalid Name')
					.setColor(BALANCER_EMBED_BLUE),
			],
		});
		return;
	}

	const { response: getRes } = await balancerFetch(`/player/${resolved.uuid}`, {
		method: 'GET',
	});
	const getRawBody = await getRes.text();
	const previewFiles = balancerApiJsonAttachments(undefined, getRawBody);
	const previewFileOpts = previewFiles.length > 0 ? { files: previewFiles } : {};

	if (!getRes.ok) {
		if (getRes.status === 404) {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle('Player Not Found')
						.setColor(BALANCER_EMBED_BLUE),
				],
				...previewFileOpts,
			});
			return;
		}
		await interaction.editReply({
			content: formatFailedApiBody(getRes.status, getRawBody),
			...previewFileOpts,
		});
		return;
	}

	const playerGet = parseJsonBody(getRawBody) as PlayerGetBody;

	const reply = await interaction.editReply({
		embeds: [deletePreviewEmbed(playerGet)],
		components: [deleteActiveButtons()],
		...previewFileOpts,
	});

	const clicked = await reply.awaitMessageComponent({
		time: 20_000,
		componentType: ComponentType.Button,
		filter: (i) =>
			(i.customId === DELETE_CONFIRM || i.customId === DELETE_CANCEL) &&
			hasCoordinatorRole(i),
	}).catch(() => null);

	if (clicked === null) {
		return;
	}

	await clicked.deferUpdate();
	const who = truncateButtonLabel(
		`${clicked.customId === DELETE_CANCEL ? 'Cancel' : 'Confirm'} (${interactionMemberDisplayName(clicked)})`,
	);
	const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`player:delete:done:${clicked.customId}`)
			.setLabel(who)
			.setStyle(clicked.customId === DELETE_CANCEL ? ButtonStyle.Danger : ButtonStyle.Danger)
			.setDisabled(true),
	);

	await interaction.editReply({
		embeds: [deletePreviewEmbed(playerGet)],
		components: [disabledRow],
		...previewFileOpts,
	});

	if (clicked.customId === DELETE_CANCEL) {
		return;
	}

	if (!isPublicThreadParentChannel(interaction.channel)) {
		await interaction.followUp({
			embeds: [cannotThreadEmbed],
		});
		return;
	}

	await runInReplyThread({
		interaction,
		starterMessage: reply,
		threadTitle: `Delete Player ${playerGet.name}`,
		threadTitleWhenEmpty: 'Delete Player',
		logLabel: 'player delete: failed to create thread or post result',
		onNoThreadParent: async () => {
			await interaction.followUp({
				embeds: [cannotThreadEmbed],
			});
		},
		inThread: async (thread) => {
			const { response: res } = await balancerFetch(`/player/${playerGet.uuid}`, {
				method: 'DELETE',
			});
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(undefined, rawBody);
			const fileOpts = files.length > 0 ? { files } : {};

			if (!res.ok) {
				if (res.status === 404) {
					await thread.send({
						embeds: [
							new EmbedBuilder()
								.setTitle('Player not found')
								.setColor(BALANCER_EMBED_BLUE),
						],
						...fileOpts,
					});
					return;
				}
				await thread.send({
					content: formatFailedApiBody(res.status, rawBody),
					...fileOpts,
				});
				return;
			}

			const parsed = parseJsonBody(rawBody) as PlayerDeleteBody;
			await thread.send({
				embeds: [tablesRemovedEmbed(parsed.tablesRemoved)],
				...fileOpts,
			});
		},
	});
}

export const player = {
	data: new SlashCommandBuilder()
		.setName('player')
		.setDescription('Player endpoints')
		.addSubcommand((sub) =>
			sub
				.setName('add')
				.setDescription('Add a player (POST /player/add)')
				.addStringOption((o) =>
					o
						.setName('player')
						.setDescription('Minecraft name or UUID')
						.setRequired(true),
				)
				.addIntegerOption((o) =>
					o
						.setName('base_weight')
						.setDescription('Base weight for this player')
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName('delete')
				.setDescription('Delete a player (GET then DELETE /player/{uuid})')
				.addStringOption((o) =>
					o
						.setName('player')
						.setDescription('Minecraft name or UUID')
						.setRequired(true),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub === 'add') {
			await executeAdd(interaction);
			return;
		}
		if (sub === 'delete') {
			await executeDelete(interaction);
			return;
		}
		await interaction.editReply({ content: `Unknown subcommand: ${sub}` });
	},
};
