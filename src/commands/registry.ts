import type {ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder} from 'discord.js';
import { balance } from './balance.js';
import { ping } from './ping.js';
import { settings } from './settings.js';
import { test } from './test.js';
import { time } from './time.js';

export type Command = {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [balance, ping, settings, test, time];
