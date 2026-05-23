import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { adjust } from './adjust.js';
import { apiHealth } from './apiHealth.js';
import { experimental } from './experimental.js';
import { experimentalDaily } from './experimentalDaily.js';
import { experimentalDailyAll } from './experimentalDailyAll.js';
import { experimentalWeekly } from './experimentalWeekly.js';
import { experimentalLeaderboard } from './experimentalLeaderboard.js';
import { experimentalSpecWeights } from './experimentalSpecWeights.js';
import { names } from './names.js';
import { ping } from './ping.js';
import { player } from './player.js';
import { settings } from './settings.js';
import { test } from './test.js';
import { time } from './time.js';
import { trajectory } from './trajectory.js';

export type Command = {
	data:
		| SlashCommandBuilder
		| SlashCommandSubcommandsOnlyBuilder
		| SlashCommandOptionsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [
	adjust,
	apiHealth,
	experimental,
	experimentalDaily,
	experimentalDailyAll,
	experimentalWeekly,
	experimentalSpecWeights,
	experimentalLeaderboard,
	names,
	ping,
	player,
	settings,
	test,
	time,
	trajectory,
];
