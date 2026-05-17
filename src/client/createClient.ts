import { Client, GatewayIntentBits } from 'discord.js';

/** GuildMembers is privileged — enable Server Members Intent in the Discord Developer Portal. */
export function createClient(): Client {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.GuildMembers,
		],
	});
}
