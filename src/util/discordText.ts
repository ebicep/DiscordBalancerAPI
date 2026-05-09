import { GuildMember, type User } from 'discord.js';

import {
	BUTTON_LABEL_MAX,
	MAX_REPLY_LENGTH,
	MAX_THREAD_NAME_LEN,
} from '../discordLimits.js';

type InteractionMemberUser = {
	member: GuildMember | { nick?: string | null } | null;
	user: User;
};

export function clampThreadName(raw: string, whenEmpty: string): string {
	const t = raw.trim().replace(/\s+/g, ' ');
	if (t.length === 0) {
		return whenEmpty;
	}
	if (t.length <= MAX_THREAD_NAME_LEN) {
		return t;
	}
	return `${t.slice(0, MAX_THREAD_NAME_LEN - 1)}…`;
}

export function truncateDiscordReply(content: string): string {
	if (content.length <= MAX_REPLY_LENGTH) {
		return content;
	}
	return `${content.slice(0, MAX_REPLY_LENGTH)}…\n_(truncated)_`;
}

export function truncatePlainToMax(s: string, maxLen: number = MAX_REPLY_LENGTH): string {
	if (s.length <= maxLen) {
		return s;
	}
	return `${s.slice(0, maxLen)}…`;
}

export function takeLinesUntilBudget<T>(
	items: T[],
	maxLen: number,
	toLine: (item: T) => string,
): { lines: string[]; truncated: boolean } {
	const lines: string[] = [];
	let usedLen = 0;
	let truncated = false;
	for (const item of items) {
		const line = toLine(item);
		const projected = usedLen + line.length + 1;
		if (projected > maxLen) {
			truncated = true;
			break;
		}
		lines.push(line);
		usedLen = projected;
	}
	return { lines, truncated };
}

export function truncateButtonLabel(text: string, ellipsis = '…'): string {
	if (text.length <= BUTTON_LABEL_MAX) {
		return text;
	}
	return `${text.slice(0, BUTTON_LABEL_MAX - 1)}${ellipsis}`;
}

/** Guild nickname if set, otherwise Discord display name / username. */
export function interactionMemberDisplayName(interaction: InteractionMemberUser): string {
	const { member } = interaction;
	if (member instanceof GuildMember) {
		const nick = member.nickname;
		if (typeof nick === 'string' && nick.trim().length > 0) {
			return nick.trim();
		}
	}
	return interaction.user.displayName ?? interaction.user.username;
}
