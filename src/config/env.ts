export type Env = {
  token: string;
  clientId: string;
  guildId?: string;
};

export function loadEnv(): Env {
  const token = process.env.DISCORD_TOKEN?.trim();
  const clientId = process.env.CLIENT_ID?.trim();
  const guildIdRaw = process.env.GUILD_ID?.trim();

  if (!token) {
    throw new Error('DISCORD_TOKEN is required');
  }
  if (!clientId) {
    throw new Error('CLIENT_ID is required');
  }

  const guildId = guildIdRaw && guildIdRaw.length > 0 ? guildIdRaw : undefined;

  return guildId !== undefined
    ? { token, clientId, guildId }
    : { token, clientId };
}
