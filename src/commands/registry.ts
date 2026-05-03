import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { ping } from './ping.js';
import { settings } from './settings.js';
import { test } from './test.js';

export type Command = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [ping, settings, test];
