import { EmbedBuilder } from 'discord.js';

import { BALANCER_EMBED_BLUE } from './embedColors.js';

const DISCORD_FIELD_VALUE_MAX = 1024;
/** Opening/closing fence plus newlines: ```\n … \n``` */
const CODE_FENCE_OVERHEAD = 8;

function wrapInCodeBlock(content: string): string {
	return `\`\`\`\n${content}\n\`\`\``;
}

export type SpecWeightLeaderboardEntryJson = {
	uuid?: string;
	name?: string;
	'spec-weight'?: number;
};

export type SpecWeightLeaderboardResponseJson = Record<string, SpecWeightLeaderboardEntryJson[]>;

function lookupSpecEntries(
	body: SpecWeightLeaderboardResponseJson,
	spec: string,
): SpecWeightLeaderboardEntryJson[] {
	const direct = body[spec];
	if (direct !== undefined) {
		return direct;
	}
	const lower = body[spec.toLowerCase()];
	if (lower !== undefined) {
		return lower;
	}
	return [];
}

function formatSpecFieldValue(entries: SpecWeightLeaderboardEntryJson[]): string {
	const maxInner = DISCORD_FIELD_VALUE_MAX - CODE_FENCE_OVERHEAD;
	let inner: string;
	if (entries.length === 0) {
		inner = '(none)';
	} else {
		const lines = entries.map((e) => {
			const name = e.name ?? '?';
			const weight = e['spec-weight'] ?? 0;
			return `${name} - ${weight}`;
		});
		inner = lines.join('\n');
		if (inner.length > maxInner) {
			inner = `${inner.slice(0, maxInner - 1)}…`;
		}
	}
	return wrapInCodeBlock(inner);
}

export function specWeightLeaderboardEmbed(
	page: number,
	specsOrdered: readonly string[],
	body: SpecWeightLeaderboardResponseJson,
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(BALANCER_EMBED_BLUE)
		.setTitle(`Spec Weights Leaderboard (${page})`);

	for (const spec of specsOrdered) {
		const entries = lookupSpecEntries(body, spec);
		embed.addFields({
			name: spec,
			value: formatSpecFieldValue(entries),
			inline: true,
		});
	}

	return embed;
}
