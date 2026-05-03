import 'dotenv/config';

import { createClient } from './client/createClient.js';
import { getEnv, initializeEnv } from './config/env.js';
import { registerEvents } from './events/index.js';

initializeEnv();
const client = createClient();

registerEvents(client);

await client.login(getEnv().token);
