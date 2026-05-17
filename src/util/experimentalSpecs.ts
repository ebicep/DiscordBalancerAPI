export const EXPERIMENTAL_SPECS_ORDERED: readonly string[] = [
	'Pyromancer',
	'Cryomancer',
	'Aquamancer',
	'Berserker',
	'Defender',
	'Revenant',
	'Avenger',
	'Crusader',
	'Protector',
	'Thunderlord',
	'Spiritguard',
	'Earthwarden',
	'Assassin',
	'Vindicator',
	'Apothecary',
	'Conjurer',
	'Sentinel',
	'Luminary',
] as const;

export function formatSpecWeightsReply(body: Record<string, unknown>): string {
	return EXPERIMENTAL_SPECS_ORDERED.map((spec) => {
		const v = body[spec] ?? body[spec.toLowerCase()];
		return `${spec}: ${typeof v === 'number' ? v : 0}`;
	}).join('\n');
}
