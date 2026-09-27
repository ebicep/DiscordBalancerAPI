import {
	AttachmentBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import { balancerFetch } from '../api/balancerApi.js';
import { formatFailedApiBody } from '../util/apiErrorMessage.js';
import { resolveOptionalPlayerName } from '../util/coordinatorPlayer.js';
import { BALANCER_EMBED_BLUE } from '../util/embedColors.js';
import {
	EXPERIMENTAL_CLASSES_ORDERED,
	EXPERIMENTAL_SPECS_ORDERED,
	SPECS_BY_CLASS,
} from '../util/experimentalSpecs.js';
import { parseJsonBody } from '../util/jsonDiscordAttachment.js';
import { runInReplyThread } from '../util/replyThread.js';
import {
	formatWeekChartLabel,
	renderClassWeightCompositePng,
	renderWeightChartPng,
} from '../util/weightHistoryCharts.js';

type SpecWeightsPoint = Record<string, number>;

type WeeklyWeightPoint = {
	weekId?: number;
	WeekId?: number;
	timestamp?: string;
	Timestamp?: string;
	isCurrentWeek?: boolean;
	IsCurrentWeek?: boolean;
	baseWeight?: number;
	BaseWeight?: number;
	specWeights?: SpecWeightsPoint;
	SpecWeights?: SpecWeightsPoint;
};

type WeightHistoryBody = {
	name?: string;
	Name?: string;
	uuid?: string;
	Uuid?: string;
	weeks?: WeeklyWeightPoint[];
	Weeks?: WeeklyWeightPoint[];
};

function readWeek(point: WeeklyWeightPoint) {
	return {
		weekId: point.weekId ?? point.WeekId ?? 0,
		timestamp: point.timestamp ?? point.Timestamp ?? '',
		isCurrentWeek: point.isCurrentWeek ?? point.IsCurrentWeek ?? false,
		baseWeight: point.baseWeight ?? point.BaseWeight ?? 0,
		specWeights: point.specWeights ?? point.SpecWeights ?? {},
	};
}

function readSpecWeight(specWeights: SpecWeightsPoint, spec: string): number {
	const v = specWeights[spec] ?? specWeights[spec.toLowerCase()];
	return typeof v === 'number' ? v : 0;
}

function classSlug(className: string): string {
	return className.toLowerCase().replace(/\s+/g, '-');
}

export const statsWeight = {
	data: new SlashCommandBuilder()
		.setName('stats-weight')
		.setDescription('Week-by-week base and spec weight graphs')
		.addStringOption((o) =>
			o.setName('name').setDescription('Player name or UUID').setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();
		const effectiveName = resolveOptionalPlayerName(interaction);

		let res: Response;
		try {
			const out = await balancerFetch(
				`/stats/weight/${encodeURIComponent(effectiveName)}`,
				{ method: 'GET' },
			);
			res = out.response;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Could not reach Balancer API.';
			await interaction.editReply({ content: message });
			return;
		}

		const rawBody = await res.text();
		if (!res.ok) {
			await interaction.editReply({
				content: formatFailedApiBody(res.status, rawBody),
			});
			return;
		}

		const body = parseJsonBody(rawBody) as WeightHistoryBody;
		const playerName = body.name ?? body.Name ?? effectiveName;
		const weeks = (body.weeks ?? body.Weeks ?? []).map(readWeek);
		if (weeks.length === 0) {
			await interaction.editReply({
				content: 'No weekly weight history returned for this player.',
			});
			return;
		}

		const labels = weeks.map((w) => formatWeekChartLabel(w.timestamp, w.weekId));
		const baseValues = weeks.map((w) => w.baseWeight);
		const currentBase = weeks.at(-1)?.baseWeight ?? 0;
		const minBase = Math.min(...baseValues);
		const maxBase = Math.max(...baseValues);

		const basePng = await renderWeightChartPng(labels, baseValues, 'Base Weight');
		const baseAttachment = new AttachmentBuilder(basePng, { name: 'base-weight.png' });

		const embed = new EmbedBuilder()
			.setColor(BALANCER_EMBED_BLUE)
			.setTitle(`${playerName} — Weekly Weights`)
			.setImage('attachment://base-weight.png')
			.addFields(
				{ name: 'Current Base', value: String(currentBase), inline: true },
				{ name: 'Min / Max', value: `${minBase} / ${maxBase}`, inline: true },
				{ name: 'Weeks', value: String(weeks.length), inline: true },
			);

		await interaction.editReply({
			embeds: [embed],
			files: [baseAttachment],
		});

		const seriesBySpec: Record<string, number[]> = {};
		for (const spec of EXPERIMENTAL_SPECS_ORDERED) {
			seriesBySpec[spec] = weeks.map((w) => readSpecWeight(w.specWeights, spec));
		}

		const compositeResults = await Promise.all(
			EXPERIMENTAL_CLASSES_ORDERED.map(async (className, classIndex) => {
				const specs = SPECS_BY_CLASS[classIndex] as [string, string, string];
				const png = await renderClassWeightCompositePng(
					className,
					specs,
					labels,
					seriesBySpec,
				);
				const slug = classSlug(className);
				return {
					classIndex,
					className,
					specs,
					attachment: new AttachmentBuilder(png, { name: `${slug}-weights.png` }),
				};
			}),
		);

		compositeResults.sort((a, b) => a.classIndex - b.classIndex);

		const onNoThreadParent = async (): Promise<void> => {
			for (const item of compositeResults) {
				const slug = classSlug(item.className);
				const classEmbed = new EmbedBuilder()
					.setColor(BALANCER_EMBED_BLUE)
					.setTitle(item.className)
					.setDescription(item.specs.join(' · '))
					.setImage(`attachment://${slug}-weights.png`);
				await interaction.followUp({
					embeds: [classEmbed],
					files: [item.attachment],
				});
			}
		};

		await runInReplyThread({
			interaction,
			threadTitle: `${playerName} — Spec Weights`,
			threadTitleWhenEmpty: 'Spec Weights',
			logLabel: 'stats-weight: failed to post class weight charts',
			onNoThreadParent,
			onThreadOpenError: onNoThreadParent,
			inThread: async (thread) => {
				for (const item of compositeResults) {
					const slug = classSlug(item.className);
					const classEmbed = new EmbedBuilder()
						.setColor(BALANCER_EMBED_BLUE)
						.setTitle(item.className)
						.setDescription(item.specs.join(' · '))
						.setImage(`attachment://${slug}-weights.png`);
					await thread.send({
						embeds: [classEmbed],
						files: [item.attachment],
					});
				}
			},
		});
	},
};
