import {
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	GuildMember,
} from 'discord.js';

import { interactionMemberDisplayName } from './discordText.js';

const COORDINATOR_ROLE_NAME = 'COORDINATOR';

type CoordinatorCheckInteraction = ChatInputCommandInteraction | ButtonInteraction;

export function hasCoordinatorRole(interaction: CoordinatorCheckInteraction): boolean {
	const { guild, member } = interaction;
	if (guild === null || member === null) {
		return false;
	}

	const coordinatorRole = guild.roles.cache.find(
		(role) => role.name === COORDINATOR_ROLE_NAME,
	);
	if (coordinatorRole === undefined) {
		return false;
	}

	if (member instanceof GuildMember) {
		return member.roles.cache.has(coordinatorRole.id);
	}

	return member.roles.includes(coordinatorRole.id);
}

export function resolveOptionalPlayerName(
	interaction: ChatInputCommandInteraction,
	optionName = 'name',
): string {
	const nameOpt = interaction.options.getString(optionName)?.trim() ?? '';
	if (hasCoordinatorRole(interaction) && nameOpt.length > 0) {
		return nameOpt;
	}
	return interactionMemberDisplayName(interaction);
}
