import {
	type ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { truncateDiscordReply } from '../util/discordText.js';
import { balancerApiJsonAttachments } from '../util/jsonDiscordAttachment.js';
import { runInReplyThread } from '../util/replyThread.js';

type PlayerTrajectoryEntry = {
	uuid: string;
	name: string;
	trajectory: number;
};

async function postTrajectoryArtifacts(
	interaction: ChatInputCommandInteraction,
	files: ReturnType<typeof balancerApiJsonAttachments>,
	threadTitle: string,
): Promise<void> {
	if (files.length === 0) {
		return;
	}
	const onNoThreadParent = async (): Promise<void> => {
		await interaction.followUp({ files });
	};
	const onThreadOpenError = async (): Promise<void> => {
		try {
			await interaction.followUp({
				content:
					'Could not open a thread for request/response files. Posting them here.',
				files,
				flags: MessageFlags.Ephemeral,
			});
		} catch (followErr) {
			console.error('trajectory: followUp with artifacts failed', followErr);
		}
	};
	await runInReplyThread({
		interaction,
		threadTitle,
		threadTitleWhenEmpty: 'Trajectory',
		logLabel: 'trajectory: failed to post request/response artifacts',
		onNoThreadParent,
		onThreadOpenError,
		inThread: async (thread) => {
			await thread.send({ files });
		},
	});
}

export const trajectory = {
	data: new SlashCommandBuilder()
		.setName('trajectory')
		.setDescription('View or set player daily trajectory')
		.addSubcommand((sub) =>
			sub.setName('list').setDescription('List all player trajectories'),
		)
		.addSubcommand((sub) =>
			sub
				.setName('set')
				.setDescription('Set trajectory for a player')
				.addStringOption((o) =>
					o
						.setName('player')
						.setDescription('Player name or UUID')
						.setRequired(true),
				)
				.addIntegerOption((o) =>
					o
						.setName('trajectory')
						.setDescription('Trajectory value')
						.setRequired(true),
				),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const sub = interaction.options.getSubcommand();
		if (sub === 'list') {
			const { response: res, requestBody } = await balancerFetch(
				'/trajectory/list',
				{
					method: 'GET',
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
				});
				await postTrajectoryArtifacts(
					interaction,
					files,
					`Trajectory list — HTTP ${res.status}`,
				);
				return;
			}
			const body = JSON.parse(rawBody) as PlayerTrajectoryEntry[];
			const lines = [...body]
				.sort((a, b) => {
					if (b.trajectory !== a.trajectory) {
						return b.trajectory - a.trajectory;
					}
					const nameA = a.name ?? '';
					const nameB = b.name ?? '';
					if (nameA !== nameB) {
						return nameA.localeCompare(nameB);
					}
					return a.uuid.localeCompare(b.uuid);
				})
				.map((e) => `${e.name || e.uuid}: ${e.trajectory}`);
			const content =
				lines.length === 0
					? '_No trajectories returned._'
					: truncateDiscordReply(['```', ...lines, '```'].join('\n'));
			await interaction.editReply({ content });
			await postTrajectoryArtifacts(interaction, files, 'Trajectory list');
			return;
		}
		if (sub === 'set') {
			const player = interaction.options.getString('player', true);
			const trajectoryValue = interaction.options.getInteger(
				'trajectory',
				true,
			);
			const { response: res, requestBody } = await balancerFetch(
				`/trajectory/${encodeURIComponent(player)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ trajectory: trajectoryValue }),
				},
			);
			const rawBody = await res.text();
			const files = balancerApiJsonAttachments(requestBody, rawBody);
			if (!res.ok) {
				await interaction.editReply({
					content: formatFailedApiBody(res.status, rawBody),
				});
				await postTrajectoryArtifacts(
					interaction,
					files,
					`Trajectory set — HTTP ${res.status}`,
				);
				return;
			}
			const body = JSON.parse(rawBody) as PlayerTrajectoryEntry;
			const label =
				body.name && body.name !== '' ? body.name : body.uuid;
			await interaction.editReply({
				content: `Set **${label}** trajectory to \`${body.trajectory}\``,
			});
			await postTrajectoryArtifacts(
				interaction,
				files,
				`Set ${label} trajectory to ${body.trajectory}`,
			);
		}
	},
};
