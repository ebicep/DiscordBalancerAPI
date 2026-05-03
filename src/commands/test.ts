import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from 'discord.js';

export const test = {
	data: new SlashCommandBuilder()
		.setName('test')
		.setDescription('Test command'),
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		const embed = new EmbedBuilder()
			.setTitle('Test')
			.setDescription('||hello||');

		await interaction.reply({ embeds: [embed] });
	},
};
