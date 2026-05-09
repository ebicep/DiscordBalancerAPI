import { Events, type Client } from 'discord.js';

/** Log Discord and Node issues without exiting the process. */
export function registerProcessErrorHandlers(client: Client): void {
	client.on(Events.Error, (err) => {
		console.error('Discord client error:', err);
	});

	process.on('unhandledRejection', (reason) => {
		console.error('Unhandled promise rejection:', reason);
	});
}
