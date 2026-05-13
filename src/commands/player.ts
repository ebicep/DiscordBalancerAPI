import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from 'discord.js';

import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import {
	interactionMemberDisplayName,
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

const PLAYER_CONFIRM = 'player:add:confirm';
const PLAYER_CANCEL = 'player:add:cancel';

function dashedUuid(uuidNoDash: string): string {
	const compact = uuidNoDash.trim();
	return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

function looksLikeMojangUuid(value: string): boolean {
	return /^[0-9a-fA-F]{32}$/.test(value);
}

function confirmationEmbed(uuid: string, name: string, baseWeight: number): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle('Add Player?')
		.setColor(BALANCER_EMBED_BLUE)
		.setDescription(
			`UUID: \`\`\`${uuid}\`\`\`\nIGN: \`\`\`${name}\`\`\`\nWeight: \`\`\`${baseWeight}\`\`\``,
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
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub !== 'add') {
			await interaction.editReply({ content: `Unknown subcommand: ${sub}` });
			return;
		}

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
				i.customId === PLAYER_CONFIRM || i.customId === PLAYER_CANCEL
					? i.user.id === interaction.user.id
					: false,
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

		const cannotThreadEmbed = new EmbedBuilder()
			.setTitle('Cannot create thread in this channel.')
			.setColor(BALANCER_EMBED_BLUE);

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
	},
};
