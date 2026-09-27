import type { ChartConfiguration, ChartDataset } from 'chart.js';
import { createCanvas, loadImage } from 'canvas';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';

const axisTick = { color: '#b5bac1' as const };
const axisGrid = { color: 'rgba(255, 255, 255, 0.08)' as const };
const legendLabels = { color: '#dbdee1' as const };

const chartRenderer = new ChartJSNodeCanvas({
	width: 800,
	height: 400,
	backgroundColour: '#2b2d31',
	plugins: {
		modern: [ChartDataLabels],
	},
});

const subplotRenderer = new ChartJSNodeCanvas({
	width: 800,
	height: 280,
	backgroundColour: '#2b2d31',
	plugins: {
		modern: [ChartDataLabels],
	},
});

const SPEC_LINE_COLORS = ['#5865f2', '#57f287', '#fee75c'] as const;

function countLabels(color: string, align: 'top' | 'bottom' = 'top'): ChartDataset<'line'>['datalabels'] {
	return {
		align,
		anchor: align === 'top' ? 'end' : 'start',
		color,
		font: { weight: 'bold', size: 11 },
		formatter: (value: number) => String(value),
	};
}

export function formatWeekChartLabel(timestamp: string, weekId: number): string {
	const parsed = Date.parse(timestamp);
	if (!Number.isNaN(parsed)) {
		const d = new Date(parsed);
		return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
	}
	return `W${weekId}`;
}

const FILL_BY_BORDER: Record<string, string> = {
	'#5865f2': 'rgba(88, 101, 242, 0.15)',
	'#57f287': 'rgba(87, 242, 135, 0.15)',
	'#fee75c': 'rgba(254, 231, 92, 0.15)',
};

export function buildWeightLineConfig(
	labels: string[],
	values: number[],
	title: string,
	borderColor = '#5865f2',
): ChartConfiguration {
	return {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label: title,
					data: values,
					borderColor,
					backgroundColor: FILL_BY_BORDER[borderColor] ?? 'rgba(88, 101, 242, 0.15)',
					fill: true,
					tension: 0.25,
					datalabels: countLabels(borderColor),
				},
			],
		},
		options: {
			layout: { padding: { top: 24, bottom: 8 } },
			plugins: {
				legend: { display: false },
				title: {
					display: true,
					text: title,
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					ticks: { ...axisTick, maxRotation: 45, minRotation: 0 },
					grid: axisGrid,
					title: { display: true, text: 'Week', color: '#b5bac1' },
				},
				y: {
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
					title: { display: true, text: 'Weight', color: '#b5bac1' },
				},
			},
		},
	};
}

/** Plot −offset so a larger offset reads lower on the chart (spec weight = base − offset). */
function buildSpecOffsetSubplotConfig(
	labels: string[],
	offsets: number[],
	title: string,
	color: string,
): ChartConfiguration {
	const plotValues = offsets.map((offset) => -offset);
	return {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label: title,
					data: plotValues,
					borderColor: color,
					backgroundColor: FILL_BY_BORDER[color] ?? 'rgba(88, 101, 242, 0.15)',
					fill: true,
					tension: 0.25,
					datalabels: {
						align: 'top',
						anchor: 'end',
						color,
						font: { weight: 'bold', size: 11 },
						formatter: (plotValue: number) => String(plotValue),
					},
				},
			],
		},
		options: {
			layout: { padding: { top: 20, bottom: 4 } },
			plugins: {
				legend: { display: false },
				title: {
					display: true,
					text: title,
					color: '#f2f3f5',
				},
				datalabels: { display: true },
			},
			scales: {
				x: {
					ticks: { ...axisTick, maxRotation: 45, minRotation: 0 },
					grid: axisGrid,
				},
				y: {
					ticks: { ...axisTick, precision: 0 },
					grid: axisGrid,
					title: { display: true, text: '−offset', color: '#b5bac1' },
				},
			},
		},
	};
}

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

export async function renderWeightChartPng(
	labels: string[],
	values: number[],
	title: string,
): Promise<Buffer> {
	const configuration = buildWeightLineConfig(labels, values, title);
	return chartRenderer.renderToBuffer(configuration);
}

export async function renderClassWeightCompositePng(
	className: string,
	specs: readonly [string, string, string],
	labels: string[],
	seriesBySpecOffset: Readonly<Record<string, number[]>>,
): Promise<Buffer> {
	const buffers = await Promise.all(
		specs.map((spec, index) => {
			const offsets = seriesBySpecOffset[spec] ?? [];
			const color = SPEC_LINE_COLORS[index] ?? SPEC_LINE_COLORS[0];
			const configuration = buildSpecOffsetSubplotConfig(labels, offsets, spec, color);
			return subplotRenderer.renderToBuffer(configuration);
		}),
	);
	return stackPngsVertical(buffers);
}
