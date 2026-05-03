import { Events, type Client } from 'discord.js';

export function onClientReady(client: Client<true>): void {
	console.log(`Ready! Logged in as ${client.user.tag}`);
}

export function registerReadyHandler(client: Client): void {
	client.once(Events.ClientReady, (c) => {
		onClientReady(c);
	});
}
