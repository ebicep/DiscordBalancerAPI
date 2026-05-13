import {
	type AttachmentBuilder,
	type Channel,
	type ChatInputCommandInteraction,
	type Message,
	NewsChannel,
	TextChannel,
	ThreadAutoArchiveDuration,
	type ThreadChannel,
} from 'discord.js';

import { clampThreadName } from './discordText.js';

export function isPublicThreadParentChannel(
	channel: Channel | null,
): channel is TextChannel | NewsChannel {
	return channel instanceof TextChannel || channel instanceof NewsChannel;
}

export async function startOneDayThreadOnMessage(
	message: Message,
	threadTitle: string,
	titleWhenEmpty: string,
): Promise<ThreadChannel> {
	return message.startThread({
		name: clampThreadName(threadTitle, titleWhenEmpty),
		autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
	});
}

export type ReplyThreadOptions = {
	interaction: ChatInputCommandInteraction;
	starterMessage?: Message;
	threadTitle: string;
	threadTitleWhenEmpty: string;
	logLabel: string;
	shouldOpenThread?: boolean;
	/**
	 * When the channel cannot host a public thread, or when `onThreadOpenError`
	 * is omitted and opening the thread / `inThread` throws.
	 */
	onNoThreadParent: () => Promise<void>;
	/** When starting the thread or `inThread` throws; defaults to `onNoThreadParent`. */
	onThreadOpenError?: () => Promise<void>;
	inThread: (thread: ThreadChannel) => Promise<void>;
};

export async function runInReplyThread(options: ReplyThreadOptions): Promise<void> {
	const {
		interaction,
		starterMessage,
		threadTitle,
		threadTitleWhenEmpty,
		logLabel,
		shouldOpenThread = true,
		onNoThreadParent,
		onThreadOpenError,
		inThread,
	} = options;

	const message = starterMessage ?? (await interaction.fetchReply());

	if (!shouldOpenThread) {
		return;
	}

	if (!isPublicThreadParentChannel(interaction.channel)) {
		await onNoThreadParent();
		return;
	}

	try {
		const thread = await startOneDayThreadOnMessage(
			message,
			threadTitle,
			threadTitleWhenEmpty,
		);
		await inThread(thread);
	} catch (err) {
		console.error(logLabel, err);
		const recover = onThreadOpenError ?? onNoThreadParent;
		await recover();
	}
}

/** Send balancer-style JSON attachments, or a placeholder when there are none. */
export async function sendBalancerFilesToThread(
	thread: ThreadChannel,
	files: AttachmentBuilder[],
	emptyBodyContent?: string,
): Promise<void> {
	if (files.length > 0) {
		await thread.send({ files });
	} else if (emptyBodyContent !== undefined) {
		await thread.send({ content: emptyBodyContent });
	}
}
