import type { ChartConfiguration, ChartDataset } from 'chart.js';
import { createCanvas, loadImage } from 'canvas';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
	AttachmentBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import { BALANCER_EMBED_BLUE } from '../util/embedColors.js';

const chartRenderer = new ChartJSNodeCanvas({
	width: 800,
	height: 400,
	backgroundColour: '#2b2d31',
	plugins: {
		modern: [ChartDataLabels],
	},
});

const sparkRenderer = new ChartJSNodeCanvas({
	width: 240,
	height: 96,
	backgroundColour: '#2b2d31',
	plugins: {
		modern: [ChartDataLabels],
	},
});

const MOCK_DAYS = [
	'Mon 8/4',
	'Tue 8/5',
	'Wed 8/6',
	'Thu 8/7',
	'Fri 8/8',
	'Sat 8/9',
	'Sun 8/10',
] as const;

const MOCK_WINS = [2, 5, 7, 9, 14, 18, 21] as const;
const MOCK_LOSSES = [1, 3, 4, 8, 10, 12, 15] as const;

const FULL_RANGE_DAYS = [
	'7/28',
	'7/29',
	'7/30',
	'7/31',
	'8/1',
	'8/2',
	'8/3',
	'8/4',
	'8/5',
	'8/6',
	'8/7',
	'8/8',
	'8/9',
	'8/10',
] as const;
const FULL_RANGE_WINS = [1, 2, 2, 4, 5, 6, 8, 9, 11, 12, 14, 16, 18, 21] as const;

const axisTick = { color: '#b5bac1' as const };
const axisGrid = { color: 'rgba(255, 255, 255, 0.08)' as const };
const legendLabels = { color: '#dbdee1' as const };

function countLabels(color: string, align: 'top' | 'bottom' = 'top'): ChartDataset<'line'>['datalabels'] {
	return {
		align,
		anchor: align === 'top' ? 'end' : 'start',
		color,
		font: { weight: 'bold', size: 11 },
		formatter: (value: number) => String(value),
	};
}

function renderPng(
	renderer: ChartJSNodeCanvas,
	configuration: ChartConfiguration,
): Promise<Buffer> {
	return renderer.renderToBuffer(configuration);
}

/** Discord embeds only support one image; stack charts vertically for a single embed. */
async function stackPngsVertical(buffers: Buffer[], gapPx = 8): Promise<Buffer> {
	const images = await Promise.all(buffers.map((buffer) => loadImage(buffer)));
	const width = Math.max(...images.map((image) => image.width));
	const height =
		images.reduce((sum, image) => sum + image.height, 0) + gapPx * (images.length - 1);
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#2b2d31';
	ctx.fillRect(0, 0, width, height);
	let y = 0;
	for (const image of images) {
		ctx.drawImage(image, 0, y);
		y += image.height + gapPx;
	}
	return canvas.toBuffer('image/png');
}

/** Dual axis: net (W−L) + win rate %. */
function winRateNetConfig(): ChartConfiguration {
	const net = MOCK_WINS.map((w, i) => w - MOCK_LOSSES[i]!);
	const winRate = MOCK_WINS.map((w, i) => {
		const total = w + MOCK_LOSSES[i]!;
		return total === 0 ? 0 : Math.round((w / total) * 1000) / 10;
	});

	return {
		type: 'line',
		data: {
			labels: [...MOCK_DAYS],
			datasets: [
				{
					label: 'Net (W−L)',
					data: net,
					borderColor: '#5865f2',
					backgroundColor: 'rgba(88, 101, 242, 0.15)',
					fill: true,
					tension: 0.25,
					yAxisID: 'y',
					datalabels: countLabels('#5865f2'),
				},
				{
					label: 'Win rate %',
					data: winRate,
					borderColor: '#fee75c',
					backgroundColor: 'transparent',
					tension: 0.25,
					yAxisID: 'y1',
					datalabels: {
						align: 'bottom',
						anchor: 'start',
						color: '#fee75c',
						font: { weight: 'bold', size: 10 },
						formatter: (value: number) => `${value}%`,
					},
				},
			],
		},
		options: {
			layout: { padding: { top: 24, bottom: 8 } },
			plugins: {
				legend: { labels: legendLabels },
				title: {
					display: true,
					text: 'Win rate / net (mock)',
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					ticks: axisTick,
					grid: axisGrid,
					title: { display: true, text: 'Day / time', color: '#b5bac1' },
				},
				y: {
					title: { display: true, text: 'Net', color: '#b5bac1' },
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
				},
				y1: {
					position: 'right',
					min: 0,
					max: 100,
					title: { display: true, text: 'Win rate %', color: '#b5bac1' },
					ticks: {
						color: '#fee75c',
						callback: (value) => `${value}%`,
					},
					grid: { drawOnChartArea: false },
				},
			},
		},
	};
}

/** Last N days of a longer series (“zoom” into recent range). */
function rangeZoomConfig(): ChartConfiguration {
	const window = 4;
	const labels = FULL_RANGE_DAYS.slice(-window);
	const wins = FULL_RANGE_WINS.slice(-window);

	return {
		type: 'line',
		data: {
			labels: [...labels],
			datasets: [
				{
					label: 'Wins',
					data: [...wins],
					borderColor: '#57f287',
					backgroundColor: 'rgba(87, 242, 135, 0.2)',
					fill: true,
					tension: 0.25,
					pointRadius: 5,
					datalabels: countLabels('#57f287'),
				},
			],
		},
		options: {
			layout: { padding: { top: 24 } },
			plugins: {
				legend: { labels: legendLabels },
				title: {
					display: true,
					text: `Range / zoom — last ${window} days (of ${FULL_RANGE_DAYS.length})`,
					color: '#f2f3f5',
				},
				subtitle: {
					display: true,
					text: `Full series ${FULL_RANGE_DAYS[0]} → ${FULL_RANGE_DAYS.at(-1)}`,
					color: '#b5bac1',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					ticks: axisTick,
					grid: axisGrid,
					title: { display: true, text: 'Day', color: '#b5bac1' },
				},
				y: {
					beginAtZero: true,
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
					title: { display: true, text: 'Wins', color: '#b5bac1' },
				},
			},
		},
	};
}

/** Overlay two players on one chart. */
function playerCompareConfig(): ChartConfiguration {
	const alice = [3, 6, 8, 10, 13, 15, 19];
	const bob = [4, 5, 9, 11, 12, 17, 18];

	return {
		type: 'line',
		data: {
			labels: [...MOCK_DAYS],
			datasets: [
				{
					label: 'Alice',
					data: alice,
					borderColor: '#eb459e',
					backgroundColor: 'transparent',
					tension: 0.25,
					datalabels: countLabels('#eb459e', 'top'),
				},
				{
					label: 'Bob',
					data: bob,
					borderColor: '#00a8fc',
					backgroundColor: 'transparent',
					tension: 0.25,
					datalabels: countLabels('#00a8fc', 'bottom'),
				},
			],
		},
		options: {
			layout: { padding: { top: 24, bottom: 8 } },
			plugins: {
				legend: { labels: legendLabels },
				title: {
					display: true,
					text: 'Player compare — cumulative wins (mock)',
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					ticks: axisTick,
					grid: axisGrid,
					title: { display: true, text: 'Day / time', color: '#b5bac1' },
				},
				y: {
					beginAtZero: true,
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
					title: { display: true, text: 'Wins', color: '#b5bac1' },
				},
			},
		},
	};
}

/** Stacked bars by class/spec per day. */
function specBreakdownConfig(): ChartConfiguration {
	return {
		type: 'bar',
		data: {
			labels: [...MOCK_DAYS],
			datasets: [
				{
					label: 'Mage',
					data: [1, 2, 1, 3, 2, 4, 3],
					backgroundColor: '#3498db',
					datalabels: {
						color: '#fff',
						font: { weight: 'bold', size: 10 },
						formatter: (v: number) => (v > 0 ? String(v) : ''),
					},
				},
				{
					label: 'Warrior',
					data: [0, 1, 2, 1, 3, 2, 2],
					backgroundColor: '#e67e22',
					datalabels: {
						color: '#fff',
						font: { weight: 'bold', size: 10 },
						formatter: (v: number) => (v > 0 ? String(v) : ''),
					},
				},
				{
					label: 'Rogue',
					data: [1, 0, 1, 2, 1, 1, 3],
					backgroundColor: '#9b59b6',
					datalabels: {
						color: '#fff',
						font: { weight: 'bold', size: 10 },
						formatter: (v: number) => (v > 0 ? String(v) : ''),
					},
				},
			],
		},
		options: {
			plugins: {
				legend: { labels: legendLabels },
				title: {
					display: true,
					text: 'Spec breakdown — wins per day (mock)',
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					stacked: true,
					ticks: axisTick,
					grid: axisGrid,
					title: { display: true, text: 'Day / time', color: '#b5bac1' },
				},
				y: {
					stacked: true,
					beginAtZero: true,
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
					title: { display: true, text: 'Wins', color: '#b5bac1' },
				},
			},
		},
	};
}

/** Full chart used with embed fields + sparkline thumbnail. */
function extrasFullConfig(): ChartConfiguration {
	return {
		type: 'line',
		data: {
			labels: [...MOCK_DAYS],
			datasets: [
				{
					label: 'Wins',
					data: [...MOCK_WINS],
					borderColor: '#57f287',
					backgroundColor: 'rgba(87, 242, 135, 0.15)',
					fill: true,
					tension: 0.25,
					datalabels: countLabels('#57f287'),
				},
				{
					label: 'Losses',
					data: [...MOCK_LOSSES],
					borderColor: '#ed4245',
					backgroundColor: 'rgba(237, 66, 69, 0.15)',
					fill: true,
					tension: 0.25,
					datalabels: countLabels('#ed4245', 'bottom'),
				},
			],
		},
		options: {
			layout: { padding: { top: 24, bottom: 8 } },
			plugins: {
				legend: { labels: legendLabels },
				title: {
					display: true,
					text: 'Embed extras — full chart (mock)',
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: { ticks: axisTick, grid: axisGrid },
				y: {
					beginAtZero: true,
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
				},
			},
		},
	};
}

function extrasSparkConfig(): ChartConfiguration {
	return {
		type: 'line',
		data: {
			labels: [...MOCK_DAYS],
			datasets: [
				{
					label: 'Wins',
					data: [...MOCK_WINS],
					borderColor: '#57f287',
					backgroundColor: 'rgba(87, 242, 135, 0.25)',
					fill: true,
					tension: 0.3,
					pointRadius: 0,
					datalabels: { display: false },
				},
			],
		},
		options: {
			plugins: {
				legend: { display: false },
				title: { display: false },
				datalabels: { display: false },
			},
			scales: {
				x: { display: false },
				y: { display: false, beginAtZero: true },
			},
		},
	};
}

const TEST_PICTURE_COUNT = 18;
const UPLOAD_IMAGES_PER_MESSAGE = 3;

const mockChartJobs: {
	renderer: ChartJSNodeCanvas;
	config: () => ChartConfiguration;
}[] = [
	{ renderer: chartRenderer, config: winRateNetConfig },
	{ renderer: chartRenderer, config: rangeZoomConfig },
	{ renderer: chartRenderer, config: playerCompareConfig },
	{ renderer: chartRenderer, config: specBreakdownConfig },
	{ renderer: chartRenderer, config: extrasFullConfig },
	{ renderer: sparkRenderer, config: extrasSparkConfig },
];

export const test = {
	data: new SlashCommandBuilder()
		.setName('test')
		.setDescription('Test command — mock Chart.js graph examples'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply();

		const pngs = await Promise.all(
			Array.from({ length: TEST_PICTURE_COUNT }, (_, index) => {
				const job = mockChartJobs[index % mockChartJobs.length]!;
				return renderPng(job.renderer, job.config());
			}),
		);

		const embedStackPng = await stackPngsVertical(pngs);

		const embed = new EmbedBuilder()
			.setColor(BALANCER_EMBED_BLUE)
			.setImage('attachment://embed-stacked-18.png');

		await interaction.editReply({
			embeds: [embed],
			files: [new AttachmentBuilder(embedStackPng, { name: 'embed-stacked-18.png' })],
		});

		const groupCount = TEST_PICTURE_COUNT / UPLOAD_IMAGES_PER_MESSAGE;
		for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
			const offset = groupIndex * UPLOAD_IMAGES_PER_MESSAGE;
			const groupPngs = pngs.slice(offset, offset + UPLOAD_IMAGES_PER_MESSAGE);
			const groupStackPng = await stackPngsVertical(groupPngs);
			const attachmentName = `upload-group-${groupIndex + 1}.png`;

			await interaction.followUp({
				embeds: [
					new EmbedBuilder()
						.setColor(BALANCER_EMBED_BLUE)
						.setImage(`attachment://${attachmentName}`),
				],
				files: [new AttachmentBuilder(groupStackPng, { name: attachmentName })],
			});
		}
	},
};
