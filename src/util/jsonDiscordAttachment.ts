import { AttachmentBuilder } from 'discord.js';

const UNINPUT_OMIT_CHANGE_FIELDS = [
	'old_wins',
	'new_wins',
	'old_losses',
	'new_losses',
	'old_kills',
	'new_kills',
	'old_deaths',
	'new_deaths',
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Input API response with W/L/K/D stripped from each change (trajectory echo for uninput). */
export function stripWlKdFieldsForUninput(response: unknown): unknown {
	if (!isPlainObject(response)) {
		return response;
	}
	const changes = response.changes;
	if (!Array.isArray(changes)) {
		return response;
	}
	return {
		...response,
		changes: changes.map((item) => {
			if (!isPlainObject(item)) {
				return item;
			}
			const stripped = { ...item };
			for (const key of UNINPUT_OMIT_CHANGE_FIELDS) {
				delete stripped[key];
			}
			return stripped;
		}),
	};
}

export function parseJsonBody(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === '') {
		return null;
	}
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return trimmed;
	}
}

export function jsonDiscordAttachment(
	filename: string,
	data: unknown,
): AttachmentBuilder {
	const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
	return new AttachmentBuilder(buf, { name: filename });
}

/** Attachments only for non-empty JSON (or non-JSON text) bodies — omit missing sides. */
export function balancerApiJsonAttachments(
	requestBodyRaw: string | undefined,
	responseBodyRaw: string,
): AttachmentBuilder[] {
	const files: AttachmentBuilder[] = [];
	if (requestBodyRaw !== undefined && requestBodyRaw.trim() !== '') {
		files.push(
			jsonDiscordAttachment('request.json', parseJsonBody(requestBodyRaw)),
		);
	}
	if (responseBodyRaw.trim() !== '') {
		files.push(
			jsonDiscordAttachment('response.json', parseJsonBody(responseBodyRaw)),
		);
	}
	return files;
}
