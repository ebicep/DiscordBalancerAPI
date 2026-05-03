import 'dotenv/config';

import { createClient } from './client/createClient.js';
import { loadEnv } from './config/env.js';
import { registerEvents } from './events/index.js';

const env = loadEnv();
const client = createClient();

registerEvents(client);

await client.login(env.token);
