export type Tool = {
	title: string;
	url: string;
	description: string;
	repo?: string;
	featured?: boolean;
	tags?: string[];
};

/** Add one entry per GitHub Pages tool — this is the only file to edit when you ship something new. */
export const tools: Tool[] = [
	{
		title: 'Example tool',
		url: 'https://mehdisabouri.github.io/example-tool/',
		description: 'Replace with your first GH Pages project.',
		repo: 'https://github.com/mehdisabouri/example-tool',
		featured: true,
		tags: ['demo'],
	},
];
