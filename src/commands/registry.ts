import type {ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder} from 'discord.js';
import { adjust } from './adjust.js';
import { balance } from './balance.js';
import { names } from './names.js';
import { ping } from './ping.js';
import { player } from './player.js';
import { settings } from './settings.js';
import { test } from './test.js';
import { time } from './time.js';

export type Command = {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [adjust, balance, names, ping, player, settings, test, time];
