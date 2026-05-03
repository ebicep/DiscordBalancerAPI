import type {ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder} from 'discord.js';

import { ping } from './ping.js';
import { settings } from './settings.js';
import { test } from './test.js';

export type Command = {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [ping, settings, test];
