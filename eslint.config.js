import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const stylisticLayoutRules = {
	plugins: {
		'@stylistic': stylistic,
	},
	rules: {
		'@stylistic/indent': ['error', 'tab', { SwitchCase: 1 }],
		'@stylistic/no-mixed-spaces-and-tabs': 'error',
		'@stylistic/no-multiple-empty-lines': [
			'error',
			{ max: 1, maxEOF: 1, maxBOF: 0 },
		],
		'@stylistic/padded-blocks': ['error', 'never'],
		// SlashCommandBuilder chains are deep; don't force a break after every call when calls are already split across lines.
		'@stylistic/newline-per-chained-call': ['error', { ignoreChainWithDepth: 10 }],
	},
};
export default tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
	...tseslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ['**/*.ts'],
	})),
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.eslint.json',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.ts'],
		...stylisticLayoutRules,
	},
	{
		files: ['eslint.config.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.node,
			},
		},
		...stylisticLayoutRules,
	},
);
