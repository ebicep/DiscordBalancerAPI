import { type ChatInputCommandInteraction, GuildMember } from 'discord.js';

import { interactionMemberDisplayName } from './discordText.js';

export function hasCoordinatorRole(interaction: ChatInputCommandInteraction): boolean {
	const { member } = interaction;
	return (
		member instanceof GuildMember &&
		member.roles.cache.some((role) => role.name === 'COORDINATOR')
	);
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
