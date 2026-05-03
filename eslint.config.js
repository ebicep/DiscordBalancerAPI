import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const stylisticIndentRules = {
	plugins: {
		'@stylistic': stylistic,
	},
	rules: {
		'@stylistic/indent': ['error', 'tab', { SwitchCase: 1 }],
		'@stylistic/no-mixed-spaces-and-tabs': 'error',
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
		...stylisticIndentRules,
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
		...stylisticIndentRules,
	},
);
