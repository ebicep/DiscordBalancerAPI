import { ActivityType, Events, type Client } from 'discord.js';

export function onClientReady(client: Client<true>): void {
	console.log(`Ready! Logged in as ${client.user.tag}`);
	void client.user.setActivity({ type: ActivityType.Custom, name: '/ for commands' });
}

export function registerReadyHandler(client: Client): void {
	client.once(Events.ClientReady, (c) => {
		onClientReady(c);
	});
}
