import {
	ApplicationCommandOptionType,
	Events,
	GuildMember,
	type ChatInputCommandInteraction,
	type Client,
	type CommandInteractionOption,
	type Interaction,
} from 'discord.js';

import { handleBalanceButton } from '../commands/balanceButtonHandler.js';
import { isExperimentalBalanceButton } from '../commands/balanceButtons.js';
import { commands, type Command } from '../commands/registry.js';
import { GENERIC_COMMAND_FAILURE } from '../util/discordSafeErrors.js';

async function notifyInteractionFailure(interaction: Interaction): Promise<void> {
	if (!interaction.isRepliable()) {
		return;
	}
	const content = GENERIC_COMMAND_FAILURE;
	try {
		if (interaction.isChatInputCommand()) {
			if (interaction.deferred) {
				await interaction.editReply({ content });
			} else if (interaction.replied) {
				await interaction.followUp({ content });
			} else {
				await interaction.reply({ content });
			}
		} else if (interaction.deferred || interaction.replied) {
			await interaction.followUp({ content });
		} else {
			await interaction.reply({ content });
		}
	} catch (replyErr) {
		console.error(replyErr);
	}
}

function commandMap(commandsList: Command[]): Map<string, Command> {
	return new Map(commandsList.map((c) => [c.data.name, c]));
}

const commandsByName = commandMap(commands);

function serializeSlashOptions(
	options: readonly CommandInteractionOption[],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const opt of options) {
		if (
			opt.type === ApplicationCommandOptionType.Subcommand ||
			opt.type === ApplicationCommandOptionType.SubcommandGroup
		) {
			out[opt.name] =
				opt.options && opt.options.length > 0
					? serializeSlashOptions(opt.options)
					: {};
		} else {
			out[opt.name] = opt.value;
		}
	}
	return out;
}

function guildNickname(interaction: ChatInputCommandInteraction): string | null {
	const { member } = interaction;
	if (!member) {
		return null;
	}
	if (member instanceof GuildMember) {
		const n = member.nickname;
		return n && n.length > 0 ? n : null;
	}
	const n = (member as { nick?: string | null }).nick;
	return typeof n === 'string' && n.length > 0 ? n : null;
}

function logSlashCommand(interaction: ChatInputCommandInteraction): void {
	const where = interaction.guild
		? `${interaction.guild.name} (#${interaction.channelId})`
		: 'DM';
	const nick = guildNickname(interaction);
	const who =
		nick != null
			? `${interaction.user.tag} (${nick}) (${interaction.user.id})`
			: `${interaction.user.tag} (${interaction.user.id})`;
	const args = serializeSlashOptions(interaction.options.data);
	console.log(
		`[command] ${who} @ ${where} — /${interaction.commandName}`,
		JSON.stringify(args),
	);
}

export async function onInteractionCreate(
	interaction: Interaction,
): Promise<void> {
	if (interaction.isButton()) {
		if (!isExperimentalBalanceButton(interaction.customId)) {
			return;
		}
		try {
			await handleBalanceButton(interaction);
		} catch (err) {
			console.error(err);
			await notifyInteractionFailure(interaction);
		}
		return;
	}

	if (!interaction.isChatInputCommand()) {
		return;
	}

	logSlashCommand(interaction);

	const command = commandsByName.get(interaction.commandName);
	if (!command) {
		return;
	}

	try {
		await command.execute(interaction);
	} catch (err) {
		console.error(err);
		await notifyInteractionFailure(interaction);
	}
}

export function registerInteractionCreateHandler(client: Client): void {
	client.on(Events.InteractionCreate, (i) => {
		void onInteractionCreate(i).catch(async (err) => {
			console.error('InteractionCreate handler error:', err);
			await notifyInteractionFailure(i);
		});
	});
}
