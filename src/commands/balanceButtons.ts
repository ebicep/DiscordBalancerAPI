import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ButtonInteraction,
} from 'discord.js';

import {
	interactionMemberDisplayName,
	truncateButtonLabel,
} from '../util/discordText.js';

export const EXPBAL_CONFIRM_PREFIX = 'expbal:confirm:' as const;
export const EXPBAL_REBAL = 'expbal:rebal' as const;
export const EXPBAL_CANCEL = 'expbal:cancel' as const;

/** Inert ids for disabled “who clicked” buttons (must not match `isExperimentalBalanceButton`). */
const EXPBAL_NOOP_POSTED = 'expbal:noop:posted' as const;
const EXPBAL_NOOP_REBAL = 'expbal:noop:rebal' as const;
const EXPBAL_NOOP_CANCEL = 'expbal:noop:cancel' as const;

/** Guild nickname if set, otherwise Discord display name / username. */
export function balanceActorDisplayName(interaction: ButtonInteraction): string {
	return interactionMemberDisplayName(interaction);
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
			.setLabel(truncateButtonLabel(`Post (${actor})`))
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
			.setLabel(truncateButtonLabel(`Rebal (${actor})`))
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
			.setLabel(truncateButtonLabel(`Cancelled (${actor})`))
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}
