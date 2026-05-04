import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ButtonInteraction,
	GuildMember,
} from 'discord.js';

export const EXPBAL_CONFIRM_PREFIX = 'expbal:confirm:' as const;
export const EXPBAL_REBAL = 'expbal:rebal' as const;
export const EXPBAL_CANCEL = 'expbal:cancel' as const;

/** Inert ids for disabled “who clicked” buttons (must not match `isExperimentalBalanceButton`). */
const EXPBAL_NOOP_POSTED = 'expbal:noop:posted' as const;
const EXPBAL_NOOP_REBAL = 'expbal:noop:rebal' as const;
const EXPBAL_NOOP_CANCEL = 'expbal:noop:cancel' as const;

const BUTTON_LABEL_MAX = 78;

function truncateForButtonLabel(text: string): string {
	if (text.length <= BUTTON_LABEL_MAX) {
		return text;
	}
	return `${text.slice(0, BUTTON_LABEL_MAX - 1)}…`;
}

/** Guild nickname if set, otherwise Discord display name / username. */
export function balanceActorDisplayName(interaction: ButtonInteraction): string {
	if (interaction.member instanceof GuildMember) {
		const nick = interaction.member.nickname;
		if (typeof nick === 'string' && nick.trim().length > 0) {
			return nick.trim();
		}
	}
	return interaction.user.displayName ?? interaction.user.username;
}

export function isExperimentalBalanceButton(customId: string): boolean {
	return (
		customId === EXPBAL_REBAL ||
		customId === EXPBAL_CANCEL ||
		customId.startsWith(EXPBAL_CONFIRM_PREFIX)
	);
}

export function buildBalanceButtonRow(balanceId: string): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${EXPBAL_CONFIRM_PREFIX}${balanceId}`)
			.setLabel('Post')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(EXPBAL_REBAL)
			.setLabel('Rebal')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(EXPBAL_CANCEL)
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary),
	);
}

/** Single disabled row: who confirmed (same idea as old `editBal` after Post). */
export function buildPostedBalanceRow(
	actor: string,
): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(EXPBAL_NOOP_POSTED)
			.setLabel(truncateForButtonLabel(`Post (${actor})`))
			.setStyle(ButtonStyle.Success)
			.setDisabled(true),
	);
}

/** Single disabled row after Rebal was used on this message. */
export function buildRebalConsumedRow(
	actor: string,
): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(EXPBAL_NOOP_REBAL)
			.setLabel(truncateForButtonLabel(`Rebal (${actor})`))
			.setStyle(ButtonStyle.Danger)
			.setDisabled(true),
	);
}

export function buildCancelledBalanceRow(
	actor: string,
): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(EXPBAL_NOOP_CANCEL)
			.setLabel(truncateForButtonLabel(`Cancelled (${actor})`))
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}
