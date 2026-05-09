import type { Client } from 'discord.js';

import { registerProcessErrorHandlers } from './errorHandlers.js';
import { registerInteractionCreateHandler } from './interactionCreate.js';
import { registerReadyHandler } from './ready.js';

export function registerEvents(client: Client): void {
	registerProcessErrorHandlers(client);
	registerReadyHandler(client);
	registerInteractionCreateHandler(client);
}
