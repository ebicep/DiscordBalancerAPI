import 'dotenv/config';

import { REST, Routes } from 'discord.js';

import { loadEnv } from '../src/config/env.js';
import { commands } from '../src/commands/registry.js';

const env = loadEnv();
const rest = new REST().setToken(env.token);
const body = commands.map((c) => c.data.toJSON());

if (env.guildId) {
  await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), {
    body,
  });
  console.log(
    `Deployed ${commands.length} guild command(s) to guild ${env.guildId}.`,
  );
} else {
  await rest.put(Routes.applicationCommands(env.clientId), { body });
  console.log(`Deployed ${commands.length} application command(s) globally.`);
}
