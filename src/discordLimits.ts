/** Private thread / forum thread title cap (Discord). */
export const MAX_THREAD_NAME_LEN = 100;

/** Hard cap for a message `content` string (Discord). */
export const DISCORD_MESSAGE_CONTENT_MAX = 2000;

/** Conservative cap for multi-line blocks inside messages (below {@link DISCORD_MESSAGE_CONTENT_MAX}). */
export const MAX_MESSAGE_BLOCK_LEN = DISCORD_MESSAGE_CONTENT_MAX - 200;

/** Conservative cap for reply / error text (below {@link DISCORD_MESSAGE_CONTENT_MAX}). */
export const MAX_REPLY_LENGTH = DISCORD_MESSAGE_CONTENT_MAX - 100;

/** Discord button label character limit. */
export const BUTTON_LABEL_MAX = 78;
