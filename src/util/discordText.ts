import { GuildMember, type User } from 'discord.js';

import {
	BUTTON_LABEL_MAX,
	DISCORD_MESSAGE_CONTENT_MAX,
	MAX_REPLY_LENGTH,
	MAX_THREAD_NAME_LEN,
} from '../discordLimits.js';

/** Opening of a plain (no language) markdown code fence, including the first newline. */
export const MARKDOWN_PLAIN_CODE_OPEN = '```\n';

/** Closing of a plain markdown code fence, including the leading newline. */
export const MARKDOWN_PLAIN_CODE_CLOSE = '\n```';

/** Appended inside the fence when the body was shortened to fit Discord’s content limit. */
export const CODE_BLOCK_BODY_TRUNCATION_SUFFIX = '\n… (truncated)';

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

/** Wrap `inner` in a plain markdown code fence (no language tag). */
export function markdownPlainCodeBlock(inner: string): string {
	const trimmed = inner.trimEnd();
	return trimmed.length > 0
		? `${MARKDOWN_PLAIN_CODE_OPEN}${trimmed}${MARKDOWN_PLAIN_CODE_CLOSE}`
		: `${MARKDOWN_PLAIN_CODE_OPEN}_(empty)_${MARKDOWN_PLAIN_CODE_CLOSE}`;
}

/**
 * Returns a full message `content` string: a plain code fence around `inner`, shortened
 * so total length stays within {@link DISCORD_MESSAGE_CONTENT_MAX}. When shortened,
 * appends {@link CODE_BLOCK_BODY_TRUNCATION_SUFFIX} inside the fence.
 */
export function plainCodeBlockWithinDiscordContentLimit(inner: string): string {
	const full = markdownPlainCodeBlock(inner);
	if (full.length <= DISCORD_MESSAGE_CONTENT_MAX) {
		return full;
	}

	const maxInner =
		DISCORD_MESSAGE_CONTENT_MAX -
		MARKDOWN_PLAIN_CODE_OPEN.length -
		MARKDOWN_PLAIN_CODE_CLOSE.length;
	const maxBody = maxInner - CODE_BLOCK_BODY_TRUNCATION_SUFFIX.length;
	if (maxBody < 1) {
		return `${MARKDOWN_PLAIN_CODE_OPEN}${CODE_BLOCK_BODY_TRUNCATION_SUFFIX.slice(1)}${MARKDOWN_PLAIN_CODE_CLOSE}`;
	}

	const originalLines = inner.split('\n');
	const lines = [...originalLines];
	while (lines.length > 1 && lines.join('\n').length > maxBody) {
		lines.pop();
	}

	let body = lines.join('\n');
	if (body.length > maxBody) {
		body = body.slice(0, maxBody);
	}

	return `${MARKDOWN_PLAIN_CODE_OPEN}${body}${CODE_BLOCK_BODY_TRUNCATION_SUFFIX}${MARKDOWN_PLAIN_CODE_CLOSE}`;
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
