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
import { experimentalDailySpecs } from './experimentalDailySpecs.js';
import { experimentalWeekly } from './experimentalWeekly.js';
import { experimentalWeeklySpecs } from './experimentalWeeklySpecs.js';
import { experimentalLeaderboard } from './experimentalLeaderboard.js';
import { experimentalSpecWeights } from './experimentalSpecWeights.js';
import { experimentalSpecBans } from './experimentalSpecBans.js';
import { requestSpec } from './requestSpec.js';
import { names } from './names.js';
import { ping } from './ping.js';
import { player } from './player.js';
import { settings } from './settings.js';
import { test } from './test.js';
import { time } from './time.js';
import { timecurrent } from './timecurrent.js';
import { timehistory } from './timehistory.js';
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
	experimentalDailySpecs,
	experimentalWeekly,
	experimentalWeeklySpecs,
	experimentalSpecWeights,
	experimentalSpecBans,
	requestSpec,
	experimentalLeaderboard,
	names,
	ping,
	player,
	settings,
	test,
	time,
	timecurrent,
	timehistory,
	trajectory,
];
