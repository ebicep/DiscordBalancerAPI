export type Env = {
	token: string;
	clientId: string;
	guildId?: string;
	/** e.g. https://localhost:5001 or https://api.example.com (no trailing slash) */
	balancerApiBaseUrl: string;
	/** Full key: bkr_<guid>_<secret> */
	balancerApiKey: string;
	/** Optional; defaults to 1 */
	apiVersion: string;
};

/** Subset used by `balancerFetch` (same fields as on `Env`). */
export type BalancerEnv = Pick<
	Env,
  'balancerApiBaseUrl' | 'balancerApiKey' | 'apiVersion'
>;

let envInstance: Env | undefined;

const requireStr = (name: string, v: string | undefined): string => {
	if (v === undefined || v.trim() === '') {
		throw new Error(`Missing or empty environment variable: ${name}`);
	}
	return v.trim();
};

function readEnvFromProcess(): Env {
	const token = requireStr('DISCORD_TOKEN', process.env.DISCORD_TOKEN);
	const clientId = requireStr('CLIENT_ID', process.env.CLIENT_ID);
	const guildIdRaw = process.env.GUILD_ID?.trim();
	const guildId = guildIdRaw && guildIdRaw.length > 0 ? guildIdRaw : undefined;

	const base = {
		token,
		clientId,
		balancerApiBaseUrl: requireStr(
			'BALANCER_API_BASE_URL',
			process.env.BALANCER_API_BASE_URL,
		).replace(/\/$/, ''),
		balancerApiKey: requireStr('BALANCER_API_KEY', process.env.BALANCER_API_KEY),
		apiVersion: (process.env.BALANCER_API_VERSION ?? '1').trim() || '1',
	};

	return guildId !== undefined ? { ...base, guildId } : base;
}

/** Call once at process startup (bot or scripts). Safe to call again; returns the same instance. */
export function initializeEnv(): Env {
	if (envInstance !== undefined) {
		return envInstance;
	}
	envInstance = readEnvFromProcess();
	return envInstance;
}

/** Requires a prior `initializeEnv()` in this process. */
export function getEnv(): Env {
	if (envInstance === undefined) {
		throw new Error('Environment not initialized; call initializeEnv() at startup');
	}
	return envInstance;
}
