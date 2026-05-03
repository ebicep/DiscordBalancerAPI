import type { Client } from 'discord.js';

import { registerInteractionCreateHandler } from './interactionCreate.js';
import { registerReadyHandler } from './ready.js';

export function registerEvents(client: Client): void {
  registerReadyHandler(client);
  registerInteractionCreateHandler(client);
}
