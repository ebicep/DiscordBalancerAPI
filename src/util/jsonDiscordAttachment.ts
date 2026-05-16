import { AttachmentBuilder } from 'discord.js';

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
