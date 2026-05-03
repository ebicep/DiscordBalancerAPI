import { Events, type Client, type Interaction } from 'discord.js';

import { commands, type Command } from '../commands/registry.js';

function commandMap(commandsList: Command[]): Map<string, Command> {
  return new Map(commandsList.map((c) => [c.data.name, c]));
}

const commandsByName = commandMap(commands);

export async function onInteractionCreate(
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandsByName.get(interaction.commandName);
  if (!command) {
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error executing this command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'There was an error executing this command.',
        ephemeral: true,
      });
    }
  }
}

export function registerInteractionCreateHandler(client: Client): void {
  client.on(Events.InteractionCreate, (i) => {
    void onInteractionCreate(i);
  });
}
