import {
	ChannelType,
	type Guild,
	type GuildMember,
	type VoiceChannel,
} from 'discord.js';

import {
	blueRedTeamPlayerNames,
	type ExperimentalBalanceResponseJson,
} from './balanceDisplay.js';

const BLUE_VOICE_CHANNEL_NAME = '🔵';
const RED_VOICE_CHANNEL_NAME = '🔴';

function findMemberByBalanceName(
	guild: Guild,
	name: string,
): GuildMember | undefined {
	return guild.members.cache.find((member) => {
		const nickname = member.nickname;
		return nickname == null ? name === member.user.username : name === nickname;
	});
}

function findTeamVoiceChannel(
	guild: Guild,
	channelName: string,
): VoiceChannel | undefined {
	const ch = guild.channels.cache.find(
		(c) => c.type === ChannelType.GuildVoice && c.name === channelName,
	);
	return ch?.isVoiceBased() ? (ch as VoiceChannel) : undefined;
}

async function moveNamesToChannel(
	guild: Guild,
	names: string[],
	target: VoiceChannel,
	teamLabel: string,
): Promise<void> {
	const tasks = names.map(async (name) => {
		const member = findMemberByBalanceName(guild, name);
		if (member === undefined) {
			return;
		}
		if (member.voice.channel === null) {
			return;
		}
		try {
			await member.voice.setChannel(target);
			console.log(`Moved ${name} to ${teamLabel} VC`);
		} catch (err) {
			console.error(`Failed to move ${name} to ${teamLabel} VC`, err);
		}
	});
	await Promise.allSettled(tasks);
}

export async function moveBalanceTeamsToVoice(
	guild: Guild,
	response: ExperimentalBalanceResponseJson,
): Promise<void> {
	try {
		const teams = blueRedTeamPlayerNames(response);
		if (teams === null) {
			console.warn('voice team move: balance has fewer than 2 teams');
			return;
		}

		const blueChannel = findTeamVoiceChannel(guild, BLUE_VOICE_CHANNEL_NAME);
		const redChannel = findTeamVoiceChannel(guild, RED_VOICE_CHANNEL_NAME);
		if (blueChannel === undefined || redChannel === undefined) {
			console.error('voice team move: missing 🔵 or 🔴 voice channel', {
				blue: blueChannel !== undefined,
				red: redChannel !== undefined,
			});
			return;
		}

		await Promise.all([
			moveNamesToChannel(guild, teams.blue, blueChannel, 'BLUE'),
			moveNamesToChannel(guild, teams.red, redChannel, 'RED'),
		]);
	} catch (err) {
		console.error('voice team move failed', err);
	}
}
